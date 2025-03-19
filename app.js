let video = document.createElement("video"); // Hidden video element
let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");
let switchButton = document.createElement("button");
switchButton.innerText = "Switch Camera";
document.body.appendChild(switchButton);

let currentStream = null;
let useBackCamera = true; // Default to back camera
let processing = true; // Enable processing

// Hide the video element (it will still capture frames)
video.style.display = "none";
document.body.appendChild(video);

// Function to start the camera
async function startCamera(facingMode = "environment") {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop()); // Stop previous stream
    }

    try {
        let constraints = {
            video: { facingMode } // "environment" = back, "user" = front
        };
        let stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        currentStream = stream;
        video.onloadedmetadata = () => {
            video.play();
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            processFrame(); // Start processing
        };
    } catch (err) {
        console.error("Error accessing camera:", err);
    }
}

// Process frame with OpenCV and display it on the canvas
function processFrame() {
    if (!processing) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    let src = cv.imread(canvas);
    let dst = new cv.Mat();
    
    cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY); // Apply grayscale filter
    cv.imshow("canvas", dst); // Display processed image

    src.delete();
    dst.delete();

    requestAnimationFrame(processFrame); // Loop
}

// Toggle between front and back cameras
switchButton.addEventListener("click", () => {
    useBackCamera = !useBackCamera;
    startCamera(useBackCamera ? "environment" : "user");
});

// Start with the back camera
startCamera("environment");
