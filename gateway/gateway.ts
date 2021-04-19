import { spawn } from "child_process";
import * as fs from "fs";
import { sha512 } from "js-sha512";
import * as fetch from "node-fetch";
import { Cluster } from "../cluster";
import { Logger } from "../log";
import { GatewayPath } from "./paths";

export class GatewayServer {
	clusterHost: string;
    endpointHost: string;

    logger: Logger;

    routes: {
        application: string,
		env: string,
		host: string,
		port: number,
		instances: {
            endpoint: string,
			port: number
		}[],
		ssl: number,
        sockets: []
    }[] = [];

    constructor(public name: string) {
        this.clusterHost = fs.readFileSync(GatewayPath.gatewayClusterHostFile(name)).toString();
        this.endpointHost = fs.readFileSync(GatewayPath.gatewayEndpointHostFile(name)).toString();

        this.logger = new Logger("gateway");
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

            await this.reloadServer();

            res.json({});
		});
    }

    async reloadServer() {
		let configuration = "";

        this.logger.log("updating routes...");

        for (let route of this.routes) {
			this.logger.log("routing ", this.logger.hp(route.host, route.port), " to");
			
			if (route.ssl) {
				if (!fs.existsSync(GatewayPath.letsencryptRoot(route.host))) {
					this.logger.log("obtaining ssl for ", this.logger.hp(route.host, route.port));

					const process = spawn("certbot", [
						"-d", route.host, // obtain for domain
						"certonly", // only obtain cert, we match domain on our own
						"--nginx" // using nginx plugin
					]);

					await new Promise(done => {
						process.on("exit", () => done());
					});
				}
			}

            // create upstream
            const upstream = `stream_${sha512(JSON.stringify(route))}`;
            configuration += `upstream ${upstream} {`;
            
            // add instances
            for (let instance of route.instances) {
                configuration += `\n\tserver ${instance.endpoint}:${instance.port};`;

                this.logger.log("↳ upstream ", this.logger.hp(instance.endpoint, instance.port));
            }
			
			// create proxy to upstream
			configuration += `\n}\n\nserver {\n\tlisten ${route.ssl ? `${route.ssl} ssl` : route.port};\n\tserver_name ${route.host};\n\n\tlocation / {\n\t\tproxy_pass http://${upstream};\n\t}`;
			
			if (route.ssl) {
				configuration += `\n\n\tssl_certificate ${GatewayPath.letsencryptFullchain(route.host)};`;
				configuration += `\n\tssl_certificate_key ${GatewayPath.letsencryptPrivateKey(route.host)};`;
				configuration += `\n\tinclude ${GatewayPath.letsencryptOptions()};`;
				configuration += `\n\tssl_dhparam ${GatewayPath.letsencryptDHParams()};`;

				this.logger.log("  ↳ secured by ssl");
			}

            for (let socket of route.sockets) {
                configuration += `\n\n\tlocation ${socket} {\n\t\tproxy_pass http://${upstream};\n\t\tproxy_http_version 1.1;\n\t\tproxy_set_header Upgrade $http_upgrade;\n\t\tproxy_set_header Connection "Upgrade";\n\t}`;
            
                this.logger.log("  ↳ websocket on ", socket);
			}

            configuration += `\n}\n\n`;
        }

        fs.writeFileSync(GatewayPath.nginxFile(this.name), configuration);

        this.logger.log("reloading proxy server...");

        await new Promise<void>(done => {
            const reloadProcess = spawn("nginx", ["-s", "reload"]);

            reloadProcess.on("exit", () => {
                this.logger.log("routes updated");

                done();
            });
        });
    }

    static getInstalledGateways() {
        if (!fs.existsSync(GatewayPath.rootDirectory)) {
			return [];
		}

		return fs.readdirSync(GatewayPath.rootDirectory);
    }
}