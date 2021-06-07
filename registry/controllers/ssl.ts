import { Logger } from "../../shared/log";
import { Cluster } from "../../shared/cluster";
import { Handler } from "../../shared/handler";
import { RegistryServer } from "../registry";
import fs = require("fs");
import { RegistryPath } from "../paths";
import { Request } from "../../shared/request";

export class SSLRegistryController {
    logger = new Logger("ssl");

    constructor(private registry: RegistryServer) {}

    register(app) {
        new Handler(app, Cluster.api.registry.ssl.enable, async params => {
            const host = params.host;
            const port = params.port;

            for (let id of fs.readdirSync(RegistryPath.routesDirectory)) {
				if (fs.readFileSync(RegistryPath.routeHostFile(id)).toString() == host) {
                    for (let gateway of fs.readdirSync(RegistryPath.gatewaysDirectory)) {
                        this.logger.log("obtaining ssl certificate on ", this.logger.g(gateway));

                        await new Request(fs.readFileSync(RegistryPath.gatewayHostFile(gateway)).toString(), Cluster.api.gateway.ssl)
                            .append("host", host)
                            .append("port", port)
                            .send();

                        this.logger.log("obtained ssl certificate on ", this.logger.g(gateway));
                    }

					fs.writeFileSync(RegistryPath.routeSSLFile(id), port);

					return {};
				}
			}

            throw new Error("Domain not found!");
        });
    }
}