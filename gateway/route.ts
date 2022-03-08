export class Route {
    application: string;
	env: string;
	host: string;
	port: number;
	instances: RoutedInstance[];
	ssl?: number;
    sockets: string[];
    version: string;
}

export class RoutedInstance {
    name: string;
    worker: string;
    endpoint: string;
    port: number;
}