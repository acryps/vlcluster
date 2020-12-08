import * as fs from "fs";
import * as path from "path";

export class Cluster {
	static port = 9193;

	static pingInterval = 10 * 1000;
	static pingTimeout = 15 * 1000;
	static imageInstallRequestTimeout = 30 * 1000;

	static api = {
		registry: {
			createWorker: "/reg/worker/init",
			createClient: "/reg/client/init",
			createImage: "/reg/image/create",
			uploadImage: "/req/push",
			upgrade: "/upgrade",
			ping: "/reg/ping",
			install: "/req/install"
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