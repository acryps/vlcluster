import { spawn } from "child_process";
import * as fs from "fs";
import * as fetch from "node-fetch";
import { Cluster } from "../cluster";
import { GatewayPath } from "./paths";

export class GatewayServer {
    clusterHost: string;
    endpointHost: string;

    routes: {
        application: string,
		env: string,
		host: string,
		port: number,
		instances: {
            endpoint: string,
			port: number
        }[]
    }[] = [];

    constructor(public name: string) {
        this.clusterHost = fs.readFileSync(GatewayPath.gatewayClusterHostFile(name)).toString();
        this.endpointHost = fs.readFileSync(GatewayPath.gatewayEndpointHostFile(name)).toString();
    }

    static async create(clusterHost: string, clusterKey: string, name: string, endpointHost: string) {
        const response = await fetch(`http://${clusterHost}:${Cluster.port}${Cluster.api.registry.createGateway}`, {
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
            const key = req.headers["cluster-key"];

            if (key != fs.readFileSync(GatewayPath.gatewayClusterKeyFile(this.name)).toString()) {
                return res.sendStatus(500);
            }

            this.routes = req.body;

            console.log("** GATEWAY RELOAD!!");

            await this.reloadServer();

            res.json({});
        });
    }

    async reloadServer() {
        let configuration = "";

        console.log(this.routes);

        for (let route of this.routes) {
            // create upstream
            const upstream = `${route.application.replace(/[^a-z0-9]/g, "")}_${route.env.replace(/[^a-z0-9]/g, "")}_stream`;
            configuration += `upstream ${upstream} { ${route.instances.map(i => `server ${i.endpoint}:${i.port};`).join(" ")} }`;

            // create proxy to upstream
            configuration += `server { listen ${route.port}; location / { proxy_pass http://${upstream} } }`;
        }

        fs.writeFileSync(GatewayPath.nginxFile(this.name), configuration);

        await new Promise<void>(done => {
            const reloadProcess = spawn("nginx", ["-s", "reload"]);

            reloadProcess.on("exit", () => done());
        });
    }

    static getInstalledGateways() {
        if (!fs.existsSync(GatewayPath.rootDirectory)) {
			return [];
		}

		return fs.readdirSync(GatewayPath.rootDirectory);
    }
}