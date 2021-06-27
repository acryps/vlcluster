import { Logger } from "../../shared/log";
import { Cluster } from "../../shared/cluster";
import { Handler } from "../../shared/handler";
import { RegistryServer } from "../registry";
import fs = require("fs");
import { Request } from "../../shared/request";
import { Configuration } from "../../shared/configuration";

export class SSLRegistryController {
    logger = new Logger("ssl");

    constructor(private registry: RegistryServer) {}

    register(app) {
        new Handler(app, Cluster.api.registry.ssl.enable, async params => {
            const host = params.host;
            const port = params.port;

            for (let application of this.registry.configuration.applications) {
				for (let env of application.environnements) {
					for (let domain of env.routes) {
						if (domain.host == host) {
                            for (let gateway of this.registry.configuration.gateways) {
                                this.logger.log("obtaining ssl certificate on ", this.logger.g(gateway.name));

                                await new Request(gateway.endpoint, Cluster.api.gateway.ssl)
                                    .append("host", host)
                                    .append("port", port)
                                    .send();

                                this.logger.log("obtained ssl certificate on ", this.logger.g(gateway.name));
                            }

                            domain.ssl = {
                                port
                            };

                            Configuration.save();

                            await this.registry.route.updateGateways();

                            return;
                        }
                    }
                }
            }

            throw new Error(`route '${host}' not found!`);
        });
    }
}