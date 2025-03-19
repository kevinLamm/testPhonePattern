let video = document.getElementById("video");
let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");
let switchButton = document.createElement("button"); // Create a switch button
switchButton.innerText = "Switch Camera";
document.body.appendChild(switchButton);

let currentStream = null;
let useBackCamera = true; // Default to the back camera

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
        };
    } catch (err) {
        console.error("Error accessing camera:", err);
    }
}

// Function to toggle between front and back cameras
switchButton.addEventListener("click", () => {
    useBackCamera = !useBackCamera;
    startCamera(useBackCamera ? "environment" : "user");
});




// Process frame with OpenCV
function processFrame() {
    if (!streaming) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    let src = cv.imread(canvas);
    let dst = new cv.Mat();
    
    cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY); // Convert to grayscale
    cv.imshow("canvas", dst);
    
    src.delete();
    dst.delete();
    
    requestAnimationFrame(processFrame);
}

// OpenCV.js is ready
function onOpenCvReady() {
    console.log("OpenCV.js loaded");
    streaming = true;
    processFrame();
}


// Start with the back camera (or front if unavailable)
startCamera("environment");

document.getElementById("filter-btn").addEventListener("click", () => {
    streaming = !streaming;
    if (streaming) processFrame();
});
