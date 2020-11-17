import express from "express";
import { RegistryServer } from "./registry/registry";

export class Daemon {
	server;

	constructor() {
		this.server = express();
		this.server.use(express.json());

		if (RegistryServer.isInstalled()) {
			new RegistryServer().register(this.server);
		}
	}
}