import sharp from "sharp";
import {
  CHAT_IMAGE_MAX_EDGE_PX,
  CHAT_THUMB_MAX_EDGE_PX,
  LISTING_IMAGE_MAX_EDGE_PX,
  LISTING_THUMB_MAX_EDGE_PX,
  MEDIA_UPLOAD_RAW_MAX_BYTES,
} from "@/lib/imagePipelineConfig";

const MAX_INPUT_PIXELS = 4096 * 4096;

function assertInputBounds(buf: Buffer): void {
  if (buf.length > MEDIA_UPLOAD_RAW_MAX_BYTES) {
    throw new Error("file_too_large");
  }
  if (buf.length < 8) {
    throw new Error("file_tiny");
  }
}

/** SVG не гоняем через raster pipeline. */
export function sniffIsSvgMagic(buf: Buffer): boolean {
  const head = buf.subarray(0, Math.min(256, buf.length)).toString("utf8").trimStart();
  if (head.includes("<svg")) return true;
  return false;
}

export type ListingPipelineOut = {
  webp: Buffer;
  avif: Buffer;
  thumbWebp: Buffer;
};

/**
 * Авто-поворот по EXIF → strip metadata через перекодирование;
 * главный кадр + AVIF + мини-превью WebP для ленты.
 */
export async function pipelineListingPhoto(buf: Buffer): Promise<ListingPipelineOut> {
  assertInputBounds(buf);
  if (sniffIsSvgMagic(buf)) throw new Error("svg_rejected");

  const oriented = sharp(buf, {
    failOnError: false,
    limitInputPixels: MAX_INPUT_PIXELS,
    animated: false,
  }).rotate(); // Orientation from EXIF, затем без EXIF при encode

  const resized = oriented.resize({
    width: LISTING_IMAGE_MAX_EDGE_PX,
    height: LISTING_IMAGE_MAX_EDGE_PX,
    fit: "inside",
    withoutEnlargement: true,
  });

  const [webp, avif, thumbWebp] = await Promise.all([
    resized
      .clone()
      .webp({
        quality: 82,
        alphaQuality: 100,
        effort: 5,
        smartSubsample: true,
      })
      .toBuffer(),
    resized
      .clone()
      .avif({
        quality: 48,
        effort: 5,
      })
      .toBuffer(),
    resized
      .clone()
      .resize({
        width: LISTING_THUMB_MAX_EDGE_PX,
        height: LISTING_THUMB_MAX_EDGE_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality: 76,
        effort: 4,
        smartSubsample: true,
      })
      .toBuffer(),
  ]);

  return { webp, avif, thumbWebp };
}

export type ChatPipelineOut = {
  webp: Buffer;
  avif: Buffer;
  thumbWebp: Buffer;
};

export async function pipelineChatPhoto(buf: Buffer): Promise<ChatPipelineOut> {
  assertInputBounds(buf);
  if (sniffIsSvgMagic(buf)) throw new Error("svg_rejected");

  const oriented = sharp(buf, {
    failOnError: false,
    limitInputPixels: MAX_INPUT_PIXELS,
    animated: false,
  }).rotate();

  const resized = oriented.resize({
    width: CHAT_IMAGE_MAX_EDGE_PX,
    height: CHAT_IMAGE_MAX_EDGE_PX,
    fit: "inside",
    withoutEnlargement: true,
  });

  const [webp, avif, thumbWebp] = await Promise.all([
    resized
      .clone()
      .webp({
        quality: 80,
        alphaQuality: 100,
        effort: 5,
        smartSubsample: true,
      })
      .toBuffer(),
    resized.clone().avif({ quality: 46, effort: 5 }).toBuffer(),
    resized
      .clone()
      .resize({
        width: CHAT_THUMB_MAX_EDGE_PX,
        height: CHAT_THUMB_MAX_EDGE_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 74, effort: 4 })
      .toBuffer(),
  ]);

  const maxOut = 5 * 1024 * 1024;
  if (webp.length > maxOut || avif.length > maxOut) {
    throw new Error("output_too_large");
  }

  return { webp, avif, thumbWebp };
}
