import { homedir } from "node:os";
import { join } from "node:path";

// Where the HTML pages part keeps its files on the daemon machine: published pages, the local
// server's address, and the optional headless browser. Read on each call so a test can point
// PASEO_HOME at a throwaway folder.
export const pagesCacheDir = () => join(process.env.PASEO_HOME || join(homedir(), ".paseo"), "plugin-cache", "morphise", "pages");
