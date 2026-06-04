/** Display URL for screenshot thumbnails — never use raw S3 object keys as img src. */
export function resolveScreenshotImageUrl(row: {
  image_url?: string | null;
  file_path?: string | null;
}): string {
  const imageUrl = row.image_url?.trim();
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
    return imageUrl;
  }
  const filePath = row.file_path?.trim();
  if (filePath && /^https?:\/\//i.test(filePath)) {
    return filePath;
  }
  return '';
}
