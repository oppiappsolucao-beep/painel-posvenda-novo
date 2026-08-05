import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(publicDir, "login-bg-source.png");
const publicDir = path.resolve(__dirname, "../public");

const pipeline = sharp(source)
  .trim({ threshold: 12 })
  .resize({ width: 2560, withoutEnlargement: false, kernel: sharp.kernel.lanczos3 })
  .sharpen({ sigma: 0.8, m1: 0.5, m2: 0.35 })
  .modulate({ brightness: 1.02, saturation: 1.06 });

await pipeline.clone().webp({ quality: 88, effort: 6 }).toFile(path.join(publicDir, "login-bg.webp"));
await pipeline.clone().jpeg({ quality: 90, mozjpeg: true }).toFile(path.join(publicDir, "login-bg.jpg"));

const meta = await sharp(path.join(publicDir, "login-bg.webp")).metadata();
console.log("login-bg ready:", meta.width, "x", meta.height);
