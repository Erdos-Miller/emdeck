export const validateAttachments = (files: readonly { size: number }[]) => {
  if (!files.length || files.length > 16)
    throw new Error('Attach between 1 and 16 files at a time.');
  if (files.some(file => file.size > 10 * 1024 * 1024))
    throw new Error('Each attachment must be no larger than 10 MiB.');
  if (files.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024)
    throw new Error('Attach no more than 20 MiB at a time.');
};
