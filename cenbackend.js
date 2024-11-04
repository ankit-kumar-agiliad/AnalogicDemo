// Import required modules
const express = require('express');
const app = express();
const cors = require('cors');
const mqtt = require('mqtt');

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { WebSocket, WebSocketServer } = require("ws");
const http = require("http");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

//MQTT broker setup
const brokerUrl = "mqtt://broker.hivemq.com:1883"
const mqttClient = mqtt.connect(brokerUrl);

const cipProto = protoLoader.loadSync("bag.proto", {});
const gRPCObject = grpc.loadPackageDefinition(cipProto);
const cips = gRPCObject.bag;

let cipList = [];
let subscribedTopics = new Set();

// Create an HTTP server and a WebSocket server
const server = http.createServer();
const wsServer = new WebSocketServer({ server });
const port = 8081;

// Start the WebSocket server
server.listen(port, () => {
    console.log(`WebSocket server is running on port ${port}`);
});

// Handle new client connections
wsServer.on("connection", (connection) => {
    console.log("Received a new connection");
    connection.send(JSON.stringify({ data: cipList }))
    console.log("Message sent to client");
});

//MQTT connection
mqttClient.on('connect', () => {
    console.log("connected to broker");
    mqttClient.subscribe('sendstatus', (err) => {
        if (err) {
            console.log('Subscribed to error: ' + err.message);
        }
        else {
            console.log("Subscribed  successfully to sendstatus");
        }
    });

});

mqttClient.on('message', (topic, message) => {
    try {

        if (topic === 'sendstatus') {

            const cipClientInfo = JSON.parse(message.toString());

            const newTopic = `nodes/${cipClientInfo.id}/equipmentlist`;

            if (!subscribedTopics.has(newTopic)) {
                mqttClient.subscribe(newTopic, (err) => {
                    if (err) {
                        console.log('Subscribed to error: ' + err.message);
                    }
                    else {
                        subscribedTopics.add(newTopic);
                        console.log("Subscribed  successfully to :", newTopic);
                    }
                });
            }

            const existingClientIndex = cipList?.findIndex(client => client.id === cipClientInfo.id);

            if (existingClientIndex > -1) {

                cipClientInfo.lastUpdatedFrom = Date.now();
                cipClientInfo.client = new cips.Cips(`${cipClientInfo.ipaddress}:${cipClientInfo.port}`, grpc.credentials.createInsecure());
                cipList[existingClientIndex] = cipClientInfo;

            } else {
                cipClientInfo.lastUpdatedFrom = Date.now();

                cipClientInfo.client = new cips.Cips(`${cipClientInfo.ipaddress}:${cipClientInfo.port}`, grpc.credentials.createInsecure());

                cipList.push(cipClientInfo);
            }
            broadcastWebSocketMessage("CIP", cipList)
        }
        else if (topic.includes("equipmentlist")) {
            const equipmentList = JSON.parse(message.toString());
            broadcastWebSocketMessage("Equipment", equipmentList)
        }
        else {
            const bagMessage = JSON.parse(message.toString());
            broadcastWebSocketMessage("Bag", bagMessage)
        }

    } catch (error) {
        console.error(error)
    }

});

// Remove inactive clients every 60 seconds
setInterval(() => {
    const currentTime = Date.now();
    cipList = cipList.filter(client => currentTime - client.lastUpdatedFrom < 30000);
}, 60000);

app.get('/bags', (req, response) => {

    let bagList = [];
    if (cipList.length > 0) {

        const id = req.query.id;

        const cip = cipList.find(client => client.id === id);

        cip.client.GetBagList({}).on('data', (res) => {
            bagList.push(res);
        }).on('end', () => {
            console.log("Server ended bag list stream");
            response.send(bagList);
        });
    }
});

app.get('/bag', (req, res) => {
    const { id, name, size, modified } = req.query;
    const modifyDate = JSON.parse(modified);
    const cip = cipList.find(client => client.id === id.toString());

    cip.client.GetBag({ name: name, size: size, modified: modifyDate }, (err, resp) => {
        if (err) {
            console.error(err);
        } else {

            const topic = `nodes/${cip.id}/${resp.requestId}`;

            mqttClient.subscribe(topic, { qos: 1 }, (err, granted) => {
                if (err) {
                    console.error(err);
                }
                console.log(granted);
            });
            res.send(resp)
        }

    });
})

app.post('/tipUpload', (req, res) => {
    const { id, tipJson } = req.body;
    const topic = `TIP/nodes/${id}`;
    mqttClient.publish(topic, tipJson, { qos: 1, retain: true }, (err) => {
        if (err) {
            console.log(`Error in publishing on topic : ${topic}`, err.message);
        } else {
            console.log(`Published the TIP file `);
        }
    });
})

app.listen(3001, () => {
    console.log("Server running on port 3000");
});

// // Broadcast WebSocket message to all clients
function broadcastWebSocketMessage(type, message) {
    wsServer.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: type, message }));
        }
    });
}