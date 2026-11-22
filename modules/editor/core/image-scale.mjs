export const IMAGE_SCALE_MIN = 10;
export const IMAGE_SCALE_MAX = 100;
export const IMAGE_SCALE_STEP = 10;

export function validateImageScale(value) {
  if (!Number.isInteger(value) || value < IMAGE_SCALE_MIN || value > IMAGE_SCALE_MAX || value % IMAGE_SCALE_STEP !== 0) {
    throw new Error('图片大小必须为 10%–100%，每档 10%');
  }
}
