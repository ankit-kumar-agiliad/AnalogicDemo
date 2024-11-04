// Import required modules
const express = require('express');
const app = express();
const cors = require('cors');
const mqtt = require('mqtt');
const multer = require("multer");
// const { Readable } = require("stream");
const util = require("util");
// const fs = require("fs");

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

//MQTT broker setup
const brokerUrl = "mqtt://broker.hivemq.com:1883"
const mqttClient = mqtt.connect(brokerUrl);

//MQTT connection
mqttClient.on('connect', () => {
    console.log("connected to broker");
    mqttClient.subscribe('TIP/nodes/1', (err) => {
        if (err) {
            console.log('Subscribed to error:', err.message);
        }
        else {
            console.log('Subscribed to subscription success:');
        }
    });
})

const publishMessage = util.promisify(mqttClient.publish).bind(mqttClient);

mqttClient.on('message', (topic, message) => {
    try {
        if (topic.includes("Tip")) {
            console.log(message.toString());
        }

    } catch (error) {
        console.error(error)
    }

});

app.post('/tipUpload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send("No file uploaded!");
    }
    const chunkSize = 1024 * 1024 * 25;
    const fileBuffer = req.file.buffer;
    const totalChunks = Math.ceil(fileBuffer.length / chunkSize);
    const { id } = req.body;
    const topic = `TIP/nodes/${id}`;

    const promises = [];

    try {
        for (let currentChunk = 1; currentChunk <= totalChunks; currentChunk++) {
            const start = currentChunk * chunkSize;
            const end = Math.min(start + chunkSize, fileBuffer.length);
            const chunk = fileBuffer.slice(start, end);
            const publishMessagePromise = publishMessage(topic, chunk, { qos: 1 }).then(() => {
                console.log(`Published chunk ${currentChunk} of ${totalChunks} `)
            }).catch(err => {
                console.log(`Error in publishing on topic : ${topic}`, err);
            });

            promises.push(publishMessagePromise)
        }
        await Promise.all(promises);
        res.send('File uploaded and published successfully')

    } catch (error) {
        console.error(error.message);
    }

    // const stream = new Readable({
    //     read() {
    //         const start = currentChunk * chunkSize;
    //         const end = Math.min(start + chunkSize, fileBuffer.length);
    //         if (start >= fileBuffer.length) {
    //             this.push(null);
    //         } else {
    //             this.push(fileBuffer.slice(start, end));
    //             currentChunk += 1;
    //         }
    //     }
    // })

    // stream.on('data', (chunk) => {
    //     console.log(chunk);
    //     mqttClient.publish(topic, chunk, { qos: 1, retain: true }, (err) => {
    //         if (err) {
    //             console.log(`Error in publishing on topic : ${topic}`, err.message);
    //         } else {
    //             console.log(`Published chunk ${currentChunk} of ${totalChunks} `);
    //         }
    //     });
    // });

    // for await (const chunk of stream) {
    //     await publishMessage(topic, chunk, { qos: 1 })
    //     console.log(`Published chunk ${currentChunk} of ${totalChunks} `);
    // }

    // stream.on('end', () => {
    //     res.send('File uploaded and published successfully')
    // });

    // stream.on('error', (err) => {
    //     console.error("Stream error: ", err);
    //     res.status(500).send("Failed to process file upload")
    // });




})

app.listen(3001, () => {
    console.log("Server running on port 3000");
});
