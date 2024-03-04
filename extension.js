const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const basePort = 1567;
const maxRetries = 2;

function activate(context) {
  startWebSocketServer();
  console.log('Congratulations, your extension "codegpt" is now active!');

  // Command: Hello World
  let hello = vscode.commands.registerCommand(
    "codegpt.helloWorld",
    function () {
      vscode.window.showInformationMessage("Hello World from codegpt!");
    }
  );
  context.subscriptions.push(hello);

  if (!vscode.workspace.workspaceFolders) {
    vscode.window.showErrorMessage("No open workspace folder.");
  }

  // File Reading Function
  function readAllFilesInDirectory(dirPath, fileList) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const filePath = path.join(dirPath, entry.name);

      if (
        entry.isDirectory() &&
        (entry.name === "node_modules" || entry.name === ".git")
      ) {
        continue;
      } else if (
        entry.isFile() &&
        (entry.name === ".gitignore" || entry.name === "package-lock.json")
      ) {
        continue;
      }


      if (entry.isFile()) {
        console.log(`File: ${filePath}`);
        fileList.push(filePath);
      } else if (entry.isDirectory()) {
        readAllFilesInDirectory(filePath, fileList);
      }
    }
  }

  function startWebSocketServer(retryCount = 0) {
    const openFiles = {};
    const port = basePort + retryCount;

    const wss = new WebSocket.Server({ port });

    wss.on("connection", (socket) => {
      console.log("Established a new connection");

      // Send all workspace files on new connection
      sendAllFiles(socket);

      // File Modification Handling
      vscode.workspace.onDidChangeTextDocument((event) => {
        const modifiedFileContent = event.document.getText();
        const fileUri = event.document.uri.toString();

        // Update the openFiles object with modified content
        openFiles[fileUri] = modifiedFileContent;

        if (vscode.workspace.workspaceFolders) {
          const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
          const allFiles = [];

          readAllFilesInDirectory(workspacePath, allFiles);

          for (const filePath of allFiles) {
            const fileName = path.basename(filePath);

            if (filePath === fileUri) {
              const fileData =
                `/*************** ${fileName} ***************/\n` +
                modifiedFileContent +
                "\n/*************** End of " +
                fileName +
                " ***************/\n";
              socket.send(fileData);
            } else {
              const fileContent = fs.readFileSync(filePath, "utf-8");
              const fileData =
                `/*************** ${fileName} ***************/\n` +
                fileContent +
                "\n/*************** End of " +
                fileName +
                " ***************/\n";
              socket.send(fileData); // Send file content as plain text
            }
          }
        }
      });
    });

    wss.on("error", (err) => {
      if (err.code === "EADDRINUSE" && retryCount < maxRetries) {
        // Port is in use, try the next one
        startWebSocketServer(retryCount + 1);
      } else {
        // Some other error occurred
        console.error("WebSocket server error:", err);
      }
    });

    console.log(`WebSocket server started on port ${port}`);
  }


  // Functions for Sending Files
  function sendAllFiles(socket) {
    if (vscode.workspace.workspaceFolders) {
      const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
      const allFiles = [];
      readAllFilesInDirectory(workspacePath, allFiles);

      for (const filePath of allFiles) {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const fileName = path.basename(filePath); // Get file name

        // Construct the message with header/footer
        const fileData =
          `/*************** ${fileName} ***************/\n` +
          fileContent +
          "\n/*************** End of " +
          fileName +
          " ***************/\n";

        socket.send(fileData); // Send as a single string
      }
    }
  }
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
