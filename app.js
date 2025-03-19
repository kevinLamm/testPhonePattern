let video = document.createElement("video"); // Hidden video element
let canvas = document.getElementById("canvas");
let ctx = canvas.getContext("2d");
let captureButton = document.createElement("button");
captureButton.innerText = "Capture & Process";
document.body.appendChild(captureButton);

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
        let constraints = { video: { facingMode } }; // "environment" = back, "user" = front
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

// Process frame with OpenCV
function processFrame() {
    if (!processing) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    let src = cv.imread(canvas);
    let gray = new cv.Mat();
    let blurred = new cv.Mat();
    let edges = new cv.Mat();
    
    // Convert to grayscale and apply blur
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    
    // Detect edges
    cv.Canny(blurred, edges, 50, 150);
    
    // Find contours
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    
    let largestContour = null;
    let maxArea = 0;
    
    for (let i = 0; i < contours.size(); i++) {
        let contour = contours.get(i);
        let area = cv.contourArea(contour);
        
        if (area > maxArea) {
            let moments = cv.moments(contour);
            let cX = moments.m10 / moments.m00;
            let cY = moments.m01 / moments.m00;

            // Check if the object is centered
            if (Math.abs(cX - canvas.width / 2) < 100 && Math.abs(cY - canvas.height / 2) < 100) {
                maxArea = area;
                largestContour = contour;
            }
        }
    }

    if (largestContour) {
        // Draw the largest centered contour in magenta
        let color = new cv.Scalar(255, 0, 255, 255); // Magenta color
        cv.drawContours(src, contours, -1, color, 2);
        cv.imshow("canvas", src);
    }

    // Cleanup
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();

    requestAnimationFrame(processFrame);
}

// Capture and process the object
captureButton.addEventListener("click", () => {
    let src = cv.imread(canvas);
    let gray = new cv.Mat();
    let blurred = new cv.Mat();
    let edges = new cv.Mat();

    // Convert to grayscale and detect edges
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 50, 150);

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let largestContour = null;
    let maxArea = 0;
    
    for (let i = 0; i < contours.size(); i++) {
        let contour = contours.get(i);
        let area = cv.contourArea(contour);

        if (area > maxArea) {
            maxArea = area;
            largestContour = contour;
        }
    }

    if (largestContour) {
        let approx = new cv.Mat();
        let peri = cv.arcLength(largestContour, true);
        cv.approxPolyDP(largestContour, approx, 0.02 * peri, true);

        if (approx.rows === 4) {
            let points = [];
            for (let i = 0; i < 4; i++) {
                let x = approx.data32S[i * 2];
                let y = approx.data32S[i * 2 + 1];
                points.push({ x, y });
            }

            points.sort((a, b) => a.y - b.y);
            let topLeft = points[0].x < points[1].x ? points[0] : points[1];
            let topRight = points[0].x > points[1].x ? points[0] : points[1];
            let bottomLeft = points[2].x < points[3].x ? points[2] : points[3];
            let bottomRight = points[2].x > points[3].x ? points[2] : points[3];

            let srcMat = cv.matFromArray(4, 1, cv.CV_32FC2, [
                topLeft.x, topLeft.y,
                topRight.x, topRight.y,
                bottomRight.x, bottomRight.y,
                bottomLeft.x, bottomLeft.y
            ]);
            let dstMat = cv.matFromArray(4, 1, cv.CV_32FC2, [
                0, 0,
                canvas.width, 0,
                canvas.width, canvas.height,
                0, canvas.height
            ]);

            let matrix = cv.getPerspectiveTransform(srcMat, dstMat);
            let warped = new cv.Mat();
            cv.warpPerspective(src, warped, matrix, new cv.Size(canvas.width, canvas.height));

            // Create a black background
            let output = new cv.Mat.zeros(warped.rows, warped.cols, cv.CV_8UC3);
            
            // Draw green contour
            let green = new cv.Scalar(0, 255, 0, 255); // Green color
            cv.drawContours(output, contours, -1, green, 2);

            // Show and save processed image
            cv.imshow("canvas", output);

            let dataURL = canvas.toDataURL("image/png");
            let a = document.createElement("a");
            a.href = dataURL;
            a.download = "processed_object.png";
            a.click();

            // Cleanup
            warped.delete();
            output.delete();
            srcMat.delete();
            dstMat.delete();
        }
        approx.delete();
    }

    // Cleanup
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
});

// Start with the back camera
startCamera("environment");
