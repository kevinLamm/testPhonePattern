let video = document.getElementById("video");
let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");
let streaming = false;

// Access camera
async function startCamera() {
    try {
        let stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        };
    } catch (err) {
        console.error("Error accessing camera:", err);
    }
}

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

// Start camera on page load
startCamera();

document.getElementById("filter-btn").addEventListener("click", () => {
    streaming = !streaming;
    if (streaming) processFrame();
});
