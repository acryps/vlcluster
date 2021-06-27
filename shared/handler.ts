export class Handler {
    constructor(app, path, handler: ((parameters, req?, res?) => Promise<any>)) {
        app.post(path, async (req, res) => {
            const parameters = {};

            for (let parameter in req.headers) {
                if (parameter.startsWith("cluster-")) {
                    parameters[parameter.replace("cluster-", "")] = req.headers[parameter];
                }
            }

            try {
                const result = await handler(parameters, req, res);

                res.json({ data: result });
            } catch (e) {
                res.json({ error: e + "" });
            }
        });
    }
}