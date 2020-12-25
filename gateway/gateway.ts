import { spawn } from "child_process";
import * as fs from "fs";

import { GatewayPath } from "./paths";

export class GatewayServer {
    clusterHost: string;
    endpointHost: string;

    constructor(public name: string) {
        this.clusterHost = fs.readFileSync(GatewayPath.gatewayClusterHostFile(name)).toString();
        this.endpointHost = fs.readFileSync(GatewayPath.gatewayEndpointHostFile(name)).toString();
    }

    static async create(clusterHost: string, clusterKey: string, name: string, endpointHost: string) {
		if (!fs.existsSync(GatewayPath.rootDirectory)) {
			fs.mkdirSync(GatewayPath.rootDirectory);
		}

        fs.mkdirSync(GatewayPath.gatewayDirectory(name));
        fs.writeFileSync(GatewayPath.gatewayClusterHostFile(name), clusterHost);
        fs.writeFileSync(GatewayPath.gatewayClusterKeyFile(name), clusterKey);
        fs.writeFileSync(GatewayPath.gatewayEndpointHostFile(name), endpointHost);
	}

    register() {
        this.reloadServer();
    }

    async reloadServer() {
        fs.writeFileSync(GatewayPath.nginxFile(this.name), `server { listen: 9090; }`);

        await new Promise<void>(done => {
            const reloadProcess = spawn("nginx", ["-s", "reload"]);

            reloadProcess.on("exit", () => done());
        })
    }

    static getInstalledGateways() {
        if (!fs.existsSync(GatewayPath.rootDirectory)) {
			return [];
		}

		return fs.readdirSync(GatewayPath.rootDirectory);
    }
}