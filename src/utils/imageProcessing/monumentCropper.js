const sharp = require('sharp');
const config = require('../../../config.json');

const settings = config.monumentCropping || {
  enabled: false,
  minWidth: 400,
  minHeight: 400,
  aspectRatioMin: 0.5,
  aspectRatioMax: 2.0
};

async function detectAndCrop(imagePath) {
  try {
    const image = sharp(imagePath);
    const { data, info } = await image
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let minX = info.width;
    let minY = info.height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const idx = y * info.width + x;
        const val = data[idx];
        if (val < 250) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX <= minX || maxY <= minY) return null;

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const aspect = width / height;

    if (
      width < settings.minWidth ||
      height < settings.minHeight ||
      aspect < settings.aspectRatioMin ||
      aspect > settings.aspectRatioMax
    ) {
      return null;
    }

    const buffer = await sharp(imagePath)
      .extract({ left: minX, top: minY, width, height })
      .toBuffer();

    return {
      buffer,
      box: { left: minX, top: minY, width, height },
      original: { width: info.width, height: info.height }
    };
  } catch (err) { // eslint-disable-line no-unused-vars
    return null;
  }
}

module.exports = { detectAndCrop };
