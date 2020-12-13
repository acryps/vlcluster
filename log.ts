import * as sha from "js-sha512";

export class Logger {
    color;

    static loadingFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

    constructor(public unit: string) {
        const hash = sha.sha512(unit);

        this.color = {
            r: hash.substr(0, 32).split("").reduce((a, c) => a + +c, 0) % 0xff,
            g: hash.substr(48, 64).split("").reduce((a, c) => a + +c, 0) % 0xff,
            b: hash.substr(128, 256).split("").reduce((a, c) => a + +c, 0) % 0xff,
        };
    }

    log(...text: string[]) {
        process.stdout.write(`[   \x1b[38;2;${this.color.r};${this.color.g};${this.color.b}m${this.unit}\x1b[0m ]\t${text.join("")}\n`);
    }

    async process(text: string[] | string, handler: (finished: (...text: string[]) => void) => {}) {
        let i = 0;

        process.stdout.write(`[ ${Logger.loadingFrames[0]} \x1b[38;2;${this.color.r};${this.color.g};${this.color.b}m${this.unit}\x1b[0m ]\t${Array.isArray(text) ? text.join("") : text}\r`);

        const interval = setInterval(() => {
            process.stdout.write(`[ ${Logger.loadingFrames[i++ % (Logger.loadingFrames.length - 1)]}\r`);
        }, 100);
        
        try {
            let result;

            await handler((...text: string[]) => {
                result = text;
            });

            clearInterval(interval);

            process.stdout.write(`[ ✔${result ? ` \x1b[38;2;${this.color.r};${this.color.g};${this.color.b}m${this.unit}\x1b[0m ]\t${result}` : ""}\n`);
        } catch (e) {
            clearInterval(interval);

            process.stdout.write(`[ ✗\n`);

            throw e;
        }
    }

    av(application: string, version: string) {
        return `${application}:${version}`;
    }

    ae(application: string, env: string) {
        return `${application}[${env}]`;
    }

    aev(application: string, env: string, version: string) {
        return `${application}[${env}]:${version}`;
    }

    w(worker: string) {
        return `<${worker}>`;
    }
}