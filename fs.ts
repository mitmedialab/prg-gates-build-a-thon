namespace FileQuery {
  export type Request = {
    /**
     * Current working directory
     */
    cwd: string;
    search: string[];
    order?: "asc" | "desc" | "<custom>";
    limit?: number;
  };
}
type FileQuery = {};

class FileAccess {
  resolve(path: string): string {}
  glob(pattern: string): string[] {}
  read(path: string): Promise<string> {}
}
