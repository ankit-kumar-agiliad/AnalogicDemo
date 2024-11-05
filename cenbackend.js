// Import required modules
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mqtt = require('mqtt');
const { Readable } = require('stream');


const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });
const CHUNK_SIZE = 50 * 1024 * 1024;

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

function publishMessage(topic, chunk, options) {
    return new Promise((resolve, reject) => {
        mqttClient.publish(topic, chunk, options, (err) => {
            if (err) {
                console.log(`Error in publishing on topic : ${topic}`, err.message);
                reject(err);
            } else {
                resolve();
            }
        });
    })
}

app.post('/tipUpload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send("No file uploaded!");
    }
    const fileBuffer = req.file.buffer;
    const totalChunks = Math.ceil(fileBuffer.length / CHUNK_SIZE);
    const { id } = req.body;
    const topic = `TIP/nodes/${id}`;
    let currentChunk = 0;
    const publishPromises = [];

    const stream = new Readable({
        read() {
            if (currentChunk >= totalChunks) {
                this.push(null);
            } else {
                const start = currentChunk * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, fileBuffer.length);
                const chunk = fileBuffer.slice(start, end);
                this.push(chunk);
                currentChunk++;
            }
        }
    });

    stream.on('data', async (chunk) => {

        const publishPromise = publishMessage(topic, chunk, { qos: 1 })
            .then(() => {
                console.log(`Published chunk ${currentChunk} of ${totalChunks} `);
            }).catch(err => console.error(err))


        publishPromises.push(publishPromise);

        // mqttClient.publish(topic, chunk, { qos: 1, retain: true }, (err) => {
        //     if (err) {
        //         console.log(`Error in publishing on topic : ${topic}`, err.message);
        //     } else {
        //         console.log(`Published chunk ${currentChunk} of ${totalChunks} `);
        //     }
        // });
    });

    // for await (const chunk of stream) {
    //     await publishMessage(topic, chunk, { qos: 1 })
    //     console.log(`Published chunk ${currentChunk} of ${totalChunks} `);
    // }

    stream.on('end', async () => {
        await Promise.all(publishPromises)
        res.send('File uploaded and published successfully')
    });

    stream.on('error', (err) => {
        console.error("Stream error: ", err);
        res.status(500).send("Failed to process file upload")
    });




})

app.listen(3001, () => {
    console.log("Server running on port 3000");
});
