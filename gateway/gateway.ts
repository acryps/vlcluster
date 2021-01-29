import { spawn } from "child_process";
import * as fs from "fs";
import * as fetch from "node-fetch";
import { Cluster } from "../cluster";
import { GatewayPath } from "./paths";

export class GatewayServer {
    clusterHost: string;
    endpointHost: string;

    routes: [];

    constructor(public name: string) {
        this.clusterHost = fs.readFileSync(GatewayPath.gatewayClusterHostFile(name)).toString();
        this.endpointHost = fs.readFileSync(GatewayPath.gatewayEndpointHostFile(name)).toString();
    }

    static async create(clusterHost: string, clusterKey: string, name: string, endpointHost: string) {
        const response = await fetch(`http://${host}:${Cluster.port}${Cluster.api.registry.createGateway}`, {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify({
                key: clusterKey,
                name,
                host: endpointHost
			})
		}).then(r => r.json());

		if (!fs.existsSync(GatewayPath.rootDirectory)) {
			fs.mkdirSync(GatewayPath.rootDirectory);
		}

        fs.mkdirSync(GatewayPath.gatewayDirectory(name));
        fs.writeFileSync(GatewayPath.gatewayClusterHostFile(name), clusterHost);
        fs.writeFileSync(GatewayPath.gatewayClusterKeyFile(name), response.key);
        fs.writeFileSync(GatewayPath.gatewayEndpointHostFile(name), endpointHost);
	}

    register(app) {
        app.post(Cluster.api.gateway.reload, async (req, res) => {
            this.routes = req.body;

            console.log("** GATEWAY RELOAD!!");

            await this.reloadServer();

            res.json({});
        });

        this.reloadServer();
    }

    async reloadServer() {
        /*let configuration = "";
        const upstream = `${application.replace(/[^a-z0-9]/g, "")}_${env.replace(/[^a-z0-9]/g, "")}_stream`;

        configuration += `upstream ${upstream} { ${instances.map(i => `server ${i.worker.endpoint}:${i.port};`).join(" ")} }`;
        configuration += `server { listen ${port}; location / { proxy_pass http://${upstream} } }`;*/

        console.log(this.routes);

        fs.writeFileSync(GatewayPath.nginxFile(this.name), `server { listen: 9090; }`);

        /*await new Promise<void>(done => {
            const reloadProcess = spawn("nginx", ["-s", "reload"]);

            reloadProcess.on("exit", () => done());
        })*/
    }

    static getInstalledGateways() {
        if (!fs.existsSync(GatewayPath.rootDirectory)) {
			return [];
		}

		return fs.readdirSync(GatewayPath.rootDirectory);
    }
}