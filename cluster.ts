import * as fs from "fs";
import * as path from "path";

export class Cluster {
	static port = 9193;

	static api = {
		registry: {
			createWorker: "/reg/worker/init"
		},
		worker: {
			install: "/wok/install"
		}
	}

	static rootDirectory: string;

	static get localDirectory() {
		return this.joinAndCreate(path.join(this.rootDirectory, "local"));
	}

	static joinAndCreate(...components) {
		const dir = path.join(...components);

		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir);
		}

		return dir;
	}
}