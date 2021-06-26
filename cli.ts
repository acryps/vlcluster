import * as readline from "readline";
import * as fs from "fs";

import { Cluster } from "./shared/cluster";
import { Logger } from "./shared/log";
import { Configuration } from "./shared/configuration";

export class CLI {
    static async getArgument(names: (string | number)[], prompt?: string | [string, string, string, string]): Promise<string> {
        return new Promise(done => {
            for (let name of names) {
                if (typeof name == "number") {
                    const args = [];

                    for (let i = 0; i < process.argv.length; i++) {
                        if (process.argv[i][0] == "-") {
                            if (process.argv[i + 1] && process.argv[i + 1][0] != "-") {
                                i++;
                            }
                        } else {
                            args.push(process.argv[i]);
                        }
                    }

                    if (args[name + 2]) {
                        return done(args[name + 2]);
                    }
                } else if (typeof name == "string") {
                    const index = process.argv.indexOf(name);

                    if (index != -1) {
                        if (process.argv[index + 1]) {
                            // return null if the parameter has no value set
                            if (process.argv[index + 1][0] == "-") {
                                return done(null);
                            } else {
                                return done(process.argv[index + 1]);
                            }
                        } else {
                            return done(null);
                        }
                    }
                }
            }

            if (prompt) {
                const input = readline.createInterface(process.stdin, process.stdout);

                if (Array.isArray(prompt)) {
                    input.question(`${prompt[0]} (${prompt[1]} = ${prompt[2]}}): `, res => {
                        input.close();

                        if (res == prompt[1]) {
                            done(prompt[3]);
                        } else {
                            done(res);
                        }
                    });
                } else {
                    input.question(`${prompt}: `, res => {
                        input.close();
                        
                        done(res)
                    });
                }
            } else {
                done(null);
            }
        });
    }

    static async getClusterName(): Promise<string> {
        if (process.argv.includes("-c") || process.argv.includes("--cluster")) {
            const cluster = await this.getArgument(["-c", "--cluster"]);
            this.setActiveCluster(cluster);

            return cluster;
        }

        try {
            const activeCluster = Configuration.activeCluster;

            if (Configuration.clients.length > 1) {
                const logger = new Logger("*");

                logger.log("using cluster ", logger.c(activeCluster));
            }

            return activeCluster;
        } catch {
            const cluster = await this.getArgument(["-c", "--cluster"], "Cluster name");
            this.setActiveCluster(cluster);

            return cluster;
        }
    }

    static setActiveCluster(cluster: string) {
        Configuration.activeCluster = cluster;
        Configuration.save();
    }
}