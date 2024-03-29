import * as fs from "fs";
import * as path from "path";

export class Cluster {
	static port = 9195;

	static pingInterval = 10 * 1000;
	static pingTimeout = 30 * 1000;
	static startRetryTimeout = 10 * 1000;
	static startupTime = 15 * 1000;

	static api = {
		registry: {
			create: {
				worker: "/registry/init/worker",
				client: "/registry/init/client",
				gateway: "/registry/init/gateway",
			},
			push: "/registry/push",
			upgrade: "/registry/upgrade",
			ping: "/registry/ping",
			pull: "/registry/pull",
			route: {
				list: "/registry/route/list",
				domain: "/registry/route/domain",
				webSocket: "/registry/route/ws"
			},
			instances: {
				list: "/registry/instances/list",
				restart: "/registry/instances/restart",
				scale: "/registry/instances/scale"
			},
			variables: {
				set: "/registry/variables/set",
				list: "/registry/variables/list",
			},
			ssl: {
				enable: "/registry/ssl/enable"
			}
		},

		worker: {
			start: "/worker/start",
			stop: "/worker/stop"
		},

		gateway: {
			reload: "/gateway/reload",
			ssl: "/gateway/ssl"
		}
	}

	static rootDirectory: string;

	static get configurationFileLocation() {
		return path.join(this.rootDirectory, "cluster.json");
	}

	static get activeClusterFileLocation() {
		return path.join(this.rootDirectory, "active-cluster.json");
	}

	static get registryConfiguration() {
		return path.join(this.rootDirectory, "registry.json");
	}

	static gatewayConfiguration(name: string) {
		return path.join(this.rootDirectory, `gateway-${name}.json`);
	}

	static workerConfiguration(name: string) {
		return path.join(this.rootDirectory, `worker-${name}.json`);
	}

	static clientConfiguration(name: string) {
		return path.join(this.rootDirectory, `client-${name}.json`);
	}

	static get logo() {
		if ((new Date().getMonth() == 9 && new Date().getDate() == 31) || (new Date().getMonth() == 2 && new Date().getDate() == 19)) {
			return ` ▌ ▐·▄▄▌   ▄▄· ▄▄▌  ▄• ▄▌.▄▄ · ▄▄▄▄▄▄▄▄ .▄▄▄  \n▪█·█▌██•  ▐█ ▌▪██•  █▪██▌▐█ ▀. •██  ▀▄.▀·▀▄ █·\n▐█▐█•██▪  ██ ▄▄██▪  █▌▐█▌▄▀▀▀█▄ ▐█.▪▐▀▀▪▄▐▀▀▄ \n ███ ▐█▌▐▌▐███▌▐█▌▐▌▐█▄█▌▐█▄▪▐█ ▐█▌·▐█▄▄▌▐█•█▌\n. ▀  .▀▀▀ ·▀▀▀ .▀▀▀  ▀▀▀  ▀▀▀▀  ▀▀▀  ▀▀▀ .▀  ▀`;
		}

		return `        __     __           __\n _   __/ /____/ /_  _______/ /____  _____\n| | / / / ___/ / / / / ___/ __/ _ \\/ ___/\n| |/ / / /__/ / /_/ (__  ) /_/  __/ /\n|___/_/\\___/_/\\__,_/____/\\__/\\___/_/`;
	}

	static get version() {
		return require("../../package.json").version;
	}
}