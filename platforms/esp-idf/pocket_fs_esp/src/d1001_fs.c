/* FAT mounting and internal-stack dispatch follow pocket-m5
 * programs/m5stack-tab5/components/pocket_system/src/services_host.c. */

#include "d1001_fs.h"

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "d1001_fs_internal.h"
#include "esp_log.h"
#include "esp_vfs_fat.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "fs.h"
#include "sdkconfig.h"

#define D1001_FS_ROOT "/pocket"
#define D1001_FS_PARTITION "storage"
#define D1001_FS_PATH_BYTES 128
#define D1001_FS_TASK_STACK (12 * 1024)
#define D1001_FS_TASK_PRIORITY 6

static const char *TAG = "d1001_fs";
static TaskHandle_t system_task;
static SemaphoreHandle_t system_busy;
static SemaphoreHandle_t system_job_ready;
static SemaphoreHandle_t system_job_done;
static void (*system_job)(void *);
static void *system_job_context;
static bool mounted;
static wl_handle_t wl_handle = WL_INVALID_HANDLE;

static void system_main(void *unused) {
  (void)unused;
  for (;;) {
    xSemaphoreTake(system_job_ready, portMAX_DELAY);
    system_job(system_job_context);
    xSemaphoreGive(system_job_done);
  }
}

static bool system_task_start(void) {
  if (system_task != NULL)
    return true;
  system_busy = xSemaphoreCreateMutex();
  system_job_ready = xSemaphoreCreateBinary();
  system_job_done = xSemaphoreCreateBinary();
  /* IDF xTaskCreate allocates the task stack from internal RAM. */
  if (system_busy != NULL && system_job_ready != NULL &&
      system_job_done != NULL &&
      xTaskCreate(system_main, "d1001_fs", D1001_FS_TASK_STACK, NULL,
                  D1001_FS_TASK_PRIORITY, &system_task) == pdPASS) {
    return true;
  }
  if (system_busy != NULL)
    vSemaphoreDelete(system_busy);
  if (system_job_ready != NULL)
    vSemaphoreDelete(system_job_ready);
  if (system_job_done != NULL)
    vSemaphoreDelete(system_job_done);
  system_busy = NULL;
  system_job_ready = NULL;
  system_job_done = NULL;
  system_task = NULL;
  return false;
}

bool d1001_fs_run(void (*job)(void *), void *context) {
  if (system_task == NULL || job == NULL)
    return false;
  if (xTaskGetCurrentTaskHandle() == system_task) {
    job(context);
    return true;
  }
  xSemaphoreTake(system_busy, portMAX_DELAY);
  system_job = job;
  system_job_context = context;
  xSemaphoreGive(system_job_ready);
  xSemaphoreTake(system_job_done, portMAX_DELAY);
  xSemaphoreGive(system_busy);
  return true;
}

static bool valid_slot(const char *slot) {
  if (slot == NULL || strlen(slot) != 16U)
    return false;
  for (size_t i = 0; i < 16U; ++i) {
    if (!((slot[i] >= '0' && slot[i] <= '9') ||
          (slot[i] >= 'a' && slot[i] <= 'f'))) {
      return false;
    }
  }
  return true;
}

typedef struct {
  const char *slot;
  esp_err_t result;
} InitJob;

static void init_on_system(void *argument) {
  InitJob *job = argument;
  if (fs_bound()) {
    job->result = ESP_ERR_INVALID_STATE;
    return;
  }
  if (!mounted) {
    const esp_vfs_fat_mount_config_t options = {
        .format_if_mount_failed = false,
        .max_files = 8,
        .allocation_unit_size = CONFIG_WL_SECTOR_SIZE,
    };
    job->result = esp_vfs_fat_spiflash_mount_rw_wl(
        D1001_FS_ROOT, D1001_FS_PARTITION, &options, &wl_handle);
    if (job->result != ESP_OK) {
      ESP_LOGE(TAG, "storage mount failed: %s", esp_err_to_name(job->result));
      return;
    }
    mounted = true;
  }
  char data[D1001_FS_PATH_BYTES];
  char temp[D1001_FS_PATH_BYTES];
  int data_length =
      snprintf(data, sizeof data, "%s/apps/%s/data", D1001_FS_ROOT, job->slot);
  int temp_length = snprintf(temp, sizeof temp, "%s/apps/%s/fs-tmp",
                             D1001_FS_ROOT, job->slot);
  if (data_length <= 0 || (size_t)data_length >= sizeof data ||
      temp_length <= 0 || (size_t)temp_length >= sizeof temp) {
    job->result = ESP_ERR_INVALID_ARG;
    return;
  }
  if (!fs_bind(data, temp, 0)) {
    ESP_LOGE(TAG, "slot %s: data.fs unavailable: %s", job->slot,
             fs_last_error());
    job->result = ESP_FAIL;
    return;
  }
  job->result = ESP_OK;
}

esp_err_t d1001_fs_init(const char *slot) {
  if (!valid_slot(slot))
    return ESP_ERR_INVALID_ARG;
  if (!system_task_start())
    return ESP_ERR_NO_MEM;
  InitJob job = {.slot = slot, .result = ESP_FAIL};
  if (!d1001_fs_run(init_on_system, &job))
    return ESP_ERR_INVALID_STATE;
  return job.result;
}

static void unbind_on_system(void *unused) {
  (void)unused;
  fs_unbind();
}

void d1001_fs_teardown(void) { (void)d1001_fs_run(unbind_on_system, NULL); }
