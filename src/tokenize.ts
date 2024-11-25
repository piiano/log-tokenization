import express from "express";
//import bodyParser from "body-parser";
import fs from "fs";
import { config } from "./config";
import { VaultAPI } from "./vaultAPI";
import { EventsProcessor , Event} from "./EventsProcessor";


const filePath = config.transformedFilesLocation;

if (fs.existsSync(filePath)) {
  try {
    fs.unlinkSync(filePath);
    console.log("Removed previous transformed file");
  } catch (err) {
    console.error("Error deleting transformed file", err);
  }
} else {
  console.log("No previous transformed file exist");
}

const vaultAPI = new VaultAPI();

const app = express();

app.use(express.json({
  limit: '500mb' // Increase from default of 100kb
}));
//app.use(bodyParser.json());


function writeJsonLines(filename: string, objects: Event[]): void {
  try {
  const stream = fs.createWriteStream(filename, { flags: 'w' });
  
  objects.forEach((obj) => {
      // Stringify object and ensure no formatting/newlines
      const line = JSON.stringify(obj).replace(/\n/g, '') + '\n';
      stream.write(line);
  });
  
  stream.end();
} catch (error) {
  console.error("Error writing to file", error);
}
}



app.post("/transform", async (req, res) => {
  const events: any[] = req.body; // Assuming events are sent as an array of objects
  //console.log(events.message);
  try {
    for (const [index, value] of events.entries()) {
      if (!value.message) {
        throw new Error("Event does not have a message field");
        return;
      }
      events[index] = JSON.parse(value.message);
    }

    await vaultAPI.init();
    const ep = new EventsProcessor(events, vaultAPI)
    const transformedEvents = await ep.processEvents();

    // write the transformed events to a file
    writeJsonLines(filePath,transformedEvents);

    res.status(200).send("Events transformed successfully");
  }
  catch (error) {
    res.status(400).send(error);
  }
});

try {
  const server = app.listen(config.server.port, () => {
    console.log(`TypeScript transformation service is running on port ${config.server.port}`);
  });
  server.on('error', (error: Error) => {
    console.error('Server error:', error);
  });
}
catch (error) {
  console.error("Error starting server", error);
}


// Add process error handlers
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Optionally write to error log file
  fs.appendFileSync('./logs/error.log', `${new Date().toISOString()} - Uncaught Exception: ${error}\n`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Optionally write to error log file
  fs.appendFileSync('./logs/error.log', `${new Date().toISOString()} - Unhandled Rejection: ${reason}\n`);
});

app.on("error", (err) => {
  console.log("error");
});

// Add error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Express middleware error:', err);
  res.status(500).send('Internal Server Error');
});