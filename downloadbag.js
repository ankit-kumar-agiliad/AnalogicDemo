const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const packageDef = protoLoader.loadSync("bag.proto", {});
const gRPCObject = grpc.loadPackageDefinition(packageDef);
const mqtt = require('mqtt');

const brokerUrl = "mqtt://broker.hivemq.com:1883";
const mqttClient = mqtt.connect(brokerUrl);

const cip = gRPCObject.bag;

function getBag(call, callback) {
    try {

        console.log(call.request);
        const requestId = `192.168.60:30/${call.request.name}`;

        const bagJSON = JSON.stringify({
            "bagId": "1",
            "bagName": call.request.name,
            "requestId": requestId,
            "downloadStatus": "Downloading..",
            "percentageDownload": "50%",
            "link": requestId
        });
        const topic = `nodes/1/${requestId}`;
        console.log(topic);
        callback(null, { requestId });

        setInterval(() => {

            mqttClient.publish(topic, bagJSON, (err) => {
                if (err) {
                    console.log(err);
                } else {
                    console.log(`Published the bagjson: ${bagJSON}`);
                }
            });
        }, 10000);


    } catch (error) {
        console.log(error)
    }
}

function main() {

    const server = new grpc.Server();

    server.addService(cip.Cips.service, {
        GetBag: getBag
    });

    server.bindAsync(`0.0.0.0:${process.argv[2]}`, grpc.ServerCredentials.createInsecure(), () => {
        console.log(`Starting server ${process.argv[2]}`)
        server.start();
    });

}

main();