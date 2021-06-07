import { Client } from "../client";
import * as fetch from "node-fetch";
import { Logger } from "../../shared/log";
import { Cluster } from "../../shared/cluster";
import { Request } from "../../shared/request";

export class InstancesClientController {
    logger = new Logger("instances");

    constructor(public client: Client) {}

    async list(application: string, env: string) {
        let instances = await new Request(this.client.host, Cluster.api.registry.instances.list)
            .auth(this.client.username, this.client.key)
            .send<{ instance, application, version, env, port }[]>();

        if (application && application != "*") {
            instances = instances.filter(i => i.application == application);
        }

        if (env && env != "*") {
            instances = instances.filter(i => i.env == env);
        }

        return instances;
    }

    async printList(application: string, env: string) {
        const instances = await this.list(application, env);
        const applications = instances.map(i => i.application).filter((c, i, a) => a.indexOf(c) == i);

        for (let application of applications) {
            this.logger.log(this.logger.a(application));

            for (let env of instances.filter(i => i.application == application).map(i => i.env).filter((c, i, a) => a.indexOf(c) == i)) {
                this.logger.log(`\t${this.logger.ae(application, env)}`);

                for (let instance of instances.filter(i => i.application == application && i.env == env)) {
                    this.logger.log(`\t\t${this.logger.aev(application, env, instance.version)} @ ${this.logger.wi(instance.worker, instance.instance)}:${instance.port}${instance.backupOf ? ` (BACKUP of ${instance.backupOf})` : ""}`);
                }
            }
        }
    }

    async restart(application: string, env: string) {
        await new Request(this.client.host, Cluster.api.registry.instances.restart)
            .auth(this.client.username, this.client.key)
            .append("application", application)
            .append("env", env)
            .send();
    }
}