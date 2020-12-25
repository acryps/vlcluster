import { spawn } from "child_process";
import * as fs from "fs";

import { GatewayPath } from "./paths";

export class GatewayServer {
    constructor(private clusterName: string) {

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
        fs.writeFileSync(GatewayPath.nginxFile(this.clusterName), `server { listen: 9090; }`);

        await new Promise<void>(done => {
            const reloadProcess = spawn("nginx", ["-s", "reload"]);

            reloadProcess.on("exit", () => done());
        })
    }
}