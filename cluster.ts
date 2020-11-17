import * as fs from "fs";
import * as path from "path";

export class Cluster {
	static rootDirectory: string;

	static get localDirectory() {
		return this.createIfNotFound(path.join(this.rootDirectory, "local"));
	}

	private static createIfNotFound(path) {
		if (!fs.existsSync(path)) {
			fs.mkdirSync(path);
		}

		return path;
	}
}