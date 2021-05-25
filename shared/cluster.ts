import * as fs from "fs";
import * as path from "path";

export class Cluster {
	static port = 9193;

	static pingInterval = 10 * 1000;
	static pingTimeout = 15 * 1000;
	static imageInstallRequestTimeout = 30 * 1000;

	static api = {
		registry: {
			create: {
				worker: "/init/worker",
				client: "/init/client",
				gateway: "/init/gateway",
			},
			push: "/push",
			upgrade: "/upgrade",
			ping: "/ping",
			pull: "/pull",
			map: {
				domain: "/map/domain",
				webSocket: "/map/ws"
			},
			instances: {
				list: "/instances/list",

				report: {
					started: "/instance/report/started",
					stopped: "/instance/report/stopped"
				}
			},
			variables: {
				set: "/variables/set",
				list: "/variables/list",
			},
			ssl: {
				enable: "/ssl/enable"
			}
		},

		gateway: {
			reload: "/reload"
		}
	}

	static rootDirectory: string;

	static get localDirectory() {
		return this.joinAndCreate(this.rootDirectory, "local");
	}

	static get clustersDirectory() {
		return this.joinAndCreate(this.rootDirectory, "clusters");
	}

	static get activeClusterNameFile() {
		return path.join(this.rootDirectory, "active-cluster");
	}

	static joinAndCreate(...components) {
		const dir = path.join(...components);

		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir);
		}

		return dir;
	}

	static get logo() {
		if ((new Date().getMonth() == 9 && new Date().getDate() == 31) || (new Date().getMonth() == 2 && new Date().getDate() == 19)) {
			return ` ▌ ▐·▄▄▌   ▄▄· ▄▄▌  ▄• ▄▌.▄▄ · ▄▄▄▄▄▄▄▄ .▄▄▄  \n▪█·█▌██•  ▐█ ▌▪██•  █▪██▌▐█ ▀. •██  ▀▄.▀·▀▄ █·\n▐█▐█•██▪  ██ ▄▄██▪  █▌▐█▌▄▀▀▀█▄ ▐█.▪▐▀▀▪▄▐▀▀▄ \n ███ ▐█▌▐▌▐███▌▐█▌▐▌▐█▄█▌▐█▄▪▐█ ▐█▌·▐█▄▄▌▐█•█▌\n. ▀  .▀▀▀ ·▀▀▀ .▀▀▀  ▀▀▀  ▀▀▀▀  ▀▀▀  ▀▀▀ .▀  ▀`;
		}

		return `        __     __           __\n _   __/ /____/ /_  _______/ /____  _____\n| | / / / ___/ / / / / ___/ __/ _ \\/ ___/\n| |/ / / /__/ / /_/ (__  ) /_/  __/ /\n|___/_/\\___/_/\\__,_/____/\\__/\\___/_/`;
	}

	static get version() {
		return require("../package.json").version;
	}
}