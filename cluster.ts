import * as fs from "fs";
import * as path from "path";

export class Cluster {
	static port = 9193;

	static api = {
		registry: {
			createWorker: "/reg/worker/init",
			createClient: "/reg/client/init",
			createImage: "/reg/image/create"
		},
		worker: {
			install: "/wok/install"
		}
	}

	static rootDirectory: string;

	static get localDirectory() {
		return this.joinAndCreate(this.rootDirectory, "local");
	}

	static get clustersDirectory() {
		return this.joinAndCreate(this.rootDirectory, "clusters");
	}

	static joinAndCreate(...components) {
		const dir = path.join(...components);

		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir);
		}

		return dir;
	}
}