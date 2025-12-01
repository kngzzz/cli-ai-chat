export class FileSystemAdapter {
  constructor(private basePath = "/") {}

  getBasePath(): string {
    return this.basePath;
  }
}
