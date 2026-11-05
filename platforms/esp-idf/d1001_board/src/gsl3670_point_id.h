/*
 * Silead point-id interface, from Seeed-Studio/reTerminal-D1001 commit
 * 5074d3b, components/esp_lcd_touch_gsl3670 (GPL-2.0-or-later).
 */
#ifndef D1001_GSL3670_POINT_ID_H
#define D1001_GSL3670_POINT_ID_H

#include <stddef.h>

#define D1001_GSL3670_POINT_ID_CAPACITY 10

typedef struct {
  int x[D1001_GSL3670_POINT_ID_CAPACITY];
  int y[D1001_GSL3670_POINT_ID_CAPACITY];
  int id[D1001_GSL3670_POINT_ID_CAPACITY];
  int finger_num;
} d1001_gsl3670_touch_info;

unsigned int gsl_mask_tiaoping(void);
unsigned int gsl_version_id(void);
void gsl_alg_id_main(d1001_gsl3670_touch_info *cinfo);
void gsl_DataInit(const unsigned int *conf_in, size_t conf_len);

#endif
