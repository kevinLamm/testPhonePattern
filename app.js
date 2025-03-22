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

window.addEventListener("load", () => {
    const splash = document.getElementById("splash-screen");
    if (splash) {
      splash.style.display = "none";
    }
  });
  

  async function startCamera(facingMode = "environment") {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }

    try {
        let constraints = { video: { facingMode } };
        let stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        currentStream = stream;
        video.onloadedmetadata = () => {
            console.log("Video dimensions:", video.videoWidth, video.videoHeight);
            video.play();
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            processFrame(); // Start processing
        
            // Hide the splash screen when the camera is ready
            const splash = document.getElementById("splash-screen");
            if (splash) {
              splash.style.display = "none";
            }
        };
        
    } catch (err) {
        console.error("Error accessing camera:", err);
    }
    
}

// Process frame with OpenCV (use thresholding to find the largest object)
function processFrame() {
    if (!processing) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    let src = cv.imread(canvas);
    let gray = new cv.Mat();
    let thresh = new cv.Mat();

    // Convert to grayscale and apply thresholding
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.threshold(gray, thresh, 128, 255, cv.THRESH_BINARY);

    // Find contours
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    
    let largestContour = null;
    let maxArea = 0;
    let centerX = canvas.width / 2;
    let centerY = canvas.height / 2;

    for (let i = 0; i < contours.size(); i++) {
        let contour = contours.get(i);
        let area = cv.contourArea(contour);
        let moments = cv.moments(contour);

        if (area > maxArea && moments.m00 !== 0) {
            let cX = moments.m10 / moments.m00;
            let cY = moments.m01 / moments.m00;

            // Ensure the object contains the center point of the camera
            if (cv.pointPolygonTest(contour, new cv.Point(centerX, centerY), false) >= 0) {
                maxArea = area;
                largestContour = contour;
            }
        }
    }

    if (largestContour) {
        let edges = new cv.Mat();
        cv.Canny(thresh, edges, 50, 150);
        let largestContourVector = new cv.MatVector();
        largestContourVector.push_back(largestContour);
        
        let color = new cv.Scalar(255, 0, 255, 255); // Magenta color
        cv.drawContours(src, largestContourVector, 0, color, 2);
        largestContourVector.delete();
        edges.delete();
    }

    cv.imshow("canvas", src);

    // Cleanup
    src.delete();
    gray.delete();
    thresh.delete();
    contours.delete();
    hierarchy.delete();

    requestAnimationFrame(processFrame);
}

// Capture and process the largest centered object
captureButton.addEventListener("click", () => {
    let src = cv.imread(canvas);
    let gray = new cv.Mat();
    let thresh = new cv.Mat();

    // Convert to grayscale and detect object via thresholding
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.threshold(gray, thresh, 128, 255, cv.THRESH_BINARY);

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

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
            let green = new cv.Scalar(0, 255, 0, 255);
            let singleContourVector = new cv.MatVector();
            singleContourVector.push_back(largestContour);
            cv.drawContours(output, singleContourVector, 0, green, 2);
            singleContourVector.delete();

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
    thresh.delete();
    contours.delete();
    hierarchy.delete();
});

// Start with the back camera
startCamera("environment");
