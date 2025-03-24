import jsaruco from "https://cdn.skypack.dev/js-aruco@0.1.0";
    
    // Extract AR and POS (choose POS1 or POS2 based on your needs)
    const AR = jsaruco.AR;
    const POS = jsaruco.POS1;  // or jsaruco.POS2
    
    
    console.log("AR:", AR);
   
    console.log("POS:", POS);

let video = document.createElement("video"); // Hidden video element
let canvas = document.getElementById("canvas");  // Visible canvas for display
let processingCanvas = document.getElementById("processing-canvas"); // Offscreen canvas for processing
let ctx = canvas.getContext("2d");
let captureButton = document.getElementById("capture-process");
let activePatternIndex = null;
// Global variables for storing data from each frame
let lastLargestContour = null;
let lastMarkerHomography = null; // Homography computed from the marker corners

 

let project = {
    name: "",
    patterns: []
  };

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

  document.addEventListener('DOMContentLoaded', () => {
    // Initialize global project variable
    window.project = {
      name: "",
      patterns: []
    };
    const menu = document.getElementById('menu-nav');
  
  document.getElementById('menu-btn').addEventListener('click', () => {
    console.log("Is aruco installed?");
  
    menu.classList.toggle('hidden');
  });
  
  document.getElementById('new-project').addEventListener('click', () => {
    project.name = "";
    project.patterns = [];
    document.getElementById('project-name').value = "";
    renderPatternList();
    menu.classList.toggle('hidden');
  });
  
  document.getElementById('open-project').addEventListener('click', () => {
    // Add logic to load a project (e.g., from local storage or file upload)
    alert("Open Project functionality goes here.");
    menu.classList.toggle('hidden');
  });
  
  document.getElementById('save-project').addEventListener('click', () => {
    // Add logic to save the project (e.g., download JSON or use local storage)
    alert("Save Project functionality goes here.");
    menu.classList.toggle('hidden');
  });
  
  document.getElementById('share-project').addEventListener('click', () => {
    // Implement share (e.g., generate shareable link or JSON export)
    alert("Share Project functionality goes here.");
    menu.classList.toggle('hidden');
  });
  
  document.getElementById("marker-btn").addEventListener("click", function() {
    menu.classList.toggle('hidden');
    window.open('Marker.pdf', '_blank'); // Open the PDF in a new tab
  });

  document.getElementById('settings-btn').addEventListener('click', () => {
    // Open settings modal or navigate to settings page
    alert("Settings functionality goes here.");
    menu.classList.toggle('hidden');
  });
  
  document.getElementById('close-camera').addEventListener('click', () => {
    document.getElementById('camera-view').classList.add('hidden');
    // Global variables for storing data from each frame
lastLargestContour = null;
lastMarkerHomography = null; // Homography computed from the marker corners

  });
  
});

function updateDebugLabel(message) {
    const debugLabel = document.getElementById('debug-label');
    debugLabel.textContent = message;
}
  
// When the video metadata is loaded, set dimensions for both canvases
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
            processingCanvas.width = video.videoWidth;
            processingCanvas.height = video.videoHeight;
            processFrame(); // Start processing

            // Hide splash screen
            const splash = document.getElementById("splash-screen");
            if (splash) {
              splash.style.display = "none";
            }
        };
    } catch (err) {
        console.error("Error accessing camera:", err);
    }
}




function processFrame() {
    if (!processing) return;

    // Draw the current video frame onto the hidden processing canvas.
    let pctx = processingCanvas.getContext("2d");
    pctx.drawImage(video, 0, 0, processingCanvas.width, processingCanvas.height);

    // Get the ImageData for js-aruco detection.
    let imageData = pctx.getImageData(0, 0, processingCanvas.width, processingCanvas.height);

    // Also read the frame into an OpenCV Mat for drawing and further processing.
    let src = cv.imread(processingCanvas);
    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    try {
        // Detect markers using js-aruco.
        var detector = new AR.Detector();
        let markers = detector.detect(imageData);
        updateDebugLabel("Marker Count: " + markers.length);

        if (markers.length > 0) {
            // Use the first detected marker.
            let marker = markers[0];
            updateDebugLabel("Marker detected with ID: " + marker.id);
            let corners = marker.corners;

            // Draw the marker outline (green).
            for (let i = 0; i < corners.length; i++) {
                let next = (i + 1) % corners.length;
                cv.line(
                    src,
                    new cv.Point(corners[i].x, corners[i].y),
                    new cv.Point(corners[next].x, corners[next].y),
                    new cv.Scalar(0, 255, 0, 255),
                    2
                );
            }

            // ----- 3D Pose Estimation Using solvePnP -----
            // Define marker size (in millimeters) and set up object points.
            let modelSize = 127;
            // Object points: marker corners in 3D (marker coordinate system with origin at the center)
            let objectPoints = cv.matFromArray(4, 1, cv.CV_32FC3, [
                -modelSize / 2, -modelSize / 2, 0,
                 modelSize / 2, -modelSize / 2, 0,
                 modelSize / 2,  modelSize / 2, 0,
                -modelSize / 2,  modelSize / 2, 0
            ]);

            // Image points: use detected corners (ensure they are in the same order as objectPoints)
            let imagePoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
                corners[0].x, corners[0].y,
                corners[1].x, corners[1].y,
                corners[2].x, corners[2].y,
                corners[3].x, corners[3].y
            ]);

            // Define approximate camera intrinsic parameters.
            let f = canvas.height; // approximate focal length
            let cx = canvas.width / 2;
            let cy = canvas.height / 2;
            let cameraMatrix = cv.matFromArray(3, 3, cv.CV_32F, [
                f, 0, cx,
                0, f, cy,
                0, 0, 1
            ]);
            let distCoeffs = cv.Mat.zeros(4, 1, cv.CV_32F);

            // Prepare output variables.
            let rvec = new cv.Mat();
            let tvec = new cv.Mat();

            // Solve for the pose.
            let success = cv.solvePnP(objectPoints, imagePoints, cameraMatrix, distCoeffs, rvec, tvec);
            if (success) {
                // Define 3D axis points (starting at the marker center).
                let axisEndpoints = cv.matFromArray(4, 1, cv.CV_32FC3, [
                    0, 0, 0,                // origin
                    modelSize, 0, 0,        // x-axis endpoint
                    0, modelSize, 0,        // y-axis endpoint
                    0, 0, -modelSize        // z-axis endpoint (into the scene)
                ]);

                // Project the 3D points onto the 2D image.
                let projectedPoints = new cv.Mat();
                cv.projectPoints(axisEndpoints, rvec, tvec, cameraMatrix, distCoeffs, projectedPoints);

                // Extract the projected points.
                let origin2D = new cv.Point(projectedPoints.data32F[0], projectedPoints.data32F[1]);
                let xAxis2D  = new cv.Point(projectedPoints.data32F[2], projectedPoints.data32F[3]);
                let yAxis2D  = new cv.Point(projectedPoints.data32F[4], projectedPoints.data32F[5]);
                let zAxis2D  = new cv.Point(projectedPoints.data32F[6], projectedPoints.data32F[7]);

                // Draw the axis lines: x (red), y (green), z (blue).
                cv.line(src, origin2D, xAxis2D, new cv.Scalar(255, 0, 0, 255), 2);
                cv.line(src, origin2D, yAxis2D, new cv.Scalar(0, 255, 0, 255), 2);
                cv.line(src, origin2D, zAxis2D, new cv.Scalar(0, 0, 255, 255), 2);

                // Clean up pose-related Mats.
                axisEndpoints.delete();
                projectedPoints.delete();
            }

            // Clean up Mats used in solvePnP.
            objectPoints.delete();
            imagePoints.delete();
            cameraMatrix.delete();
            distCoeffs.delete();
            rvec.delete();
            tvec.delete();
        } else {
            updateDebugLabel("No marker detected in this frame.");
        }
    } catch (err) {
        updateDebugLabel("Error in marker detection/pose: " + err);
    }

    // ----- Largest Contour Detection (as before) -----
    let thresh = new cv.Mat();
    cv.threshold(gray, thresh, 128, 255, cv.THRESH_BINARY);
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let largestContour = null;
    let maxArea = 0;
    let centerX = processingCanvas.width / 2;
    let centerY = processingCanvas.height / 2;
    for (let i = 0; i < contours.size(); i++) {
        let contour = contours.get(i);
        let area = cv.contourArea(contour);
        let moments = cv.moments(contour);
        if (area > maxArea && moments.m00 !== 0) {
            let cX = moments.m10 / moments.m00;
            let cY = moments.m01 / moments.m00;
            if (cv.pointPolygonTest(contour, new cv.Point(centerX, centerY), false) >= 0) {
                maxArea = area;
                largestContour = contour;
            }
        }
    }
    if (largestContour) {
        if (lastLargestContour) { lastLargestContour.delete(); }
        lastLargestContour = largestContour.clone();
        let contourVector = new cv.MatVector();
        contourVector.push_back(largestContour);
        cv.drawContours(src, contourVector, 0, new cv.Scalar(255, 0, 255, 255), 2);
        contourVector.delete();
    }

    // ----- Display Processed Frame -----
    cv.imshow("canvas", src);

    // ----- Draw Crosshairs on Top -----
    let ctx2d = canvas.getContext("2d");
    ctx2d.save();
    ctx2d.globalCompositeOperation = "difference";
    ctx2d.fillStyle = "white";
    let crosshairSize = 20;
    let chCenterX = canvas.width / 2;
    let chCenterY = canvas.height / 2;
    ctx2d.fillRect(chCenterX - crosshairSize / 2, chCenterY - 0.5, crosshairSize, 1);
    ctx2d.fillRect(chCenterX - 0.5, chCenterY - crosshairSize / 2, 1, crosshairSize);
    ctx2d.restore();

    // Cleanup remaining Mats.
    src.delete();
    gray.delete();
    thresh.delete();
    contours.delete();
    hierarchy.delete();

    requestAnimationFrame(processFrame);
}




startCamera("environment");




captureButton.addEventListener("click", captureProcess);
captureButton.addEventListener("touchstart", captureProcess);

function captureProcess(event) {
    event.preventDefault();
    updateDebugLabel("Capture & Process button clicked!");

    // Capture the current frame from the processing canvas (for visual reference, if needed)
    let src = cv.imread(processingCanvas);
    updateDebugLabel("Image captured successfully.");

    // Check that both the marker homography and the stored largest contour are available.
    if (!lastMarkerHomography || !lastLargestContour) {
        updateDebugLabel("Both an ArUco marker and a largest contour must be present.");
        src.delete();
        return;
    }

    // Compute warped contour points using the stored homography.
    // Note: lastMarkerHomography maps points from the marker's image coordinate space to the canonical marker space.
    // To apply this same transformation to the largest contour, we use its transformation.
    let warpedContourData = [];
    let numPoints = lastLargestContour.data32S.length / 2;
    // Access the homography data (a 3x3 matrix in a flat array)
    let m = lastMarkerHomography.data64F;
    for (let i = 0; i < numPoints; i++) {
        let x = lastLargestContour.data32S[i * 2];
        let y = lastLargestContour.data32S[i * 2 + 1];
        let denominator = m[6] * x + m[7] * y + m[8];
        let warpedX = (m[0] * x + m[1] * y + m[2]) / denominator;
        let warpedY = (m[3] * x + m[4] * y + m[5]) / denominator;
        warpedContourData.push({ x: warpedX, y: warpedY });
    }

    // Send the warped contour data to your pattern processing.
    if (activePatternIndex !== null) {
        project.patterns[activePatternIndex].contourData = warpedContourData;
    }
    renderPatternList();
    activePatternIndex = null;
    document.getElementById('camera-view').classList.add('hidden');

    // Cleanup
    src.delete();
}




class Pattern {
    constructor(description = "", width = 0, height = 0, contourData = null) {
      this.description = description;
      this.width = width;
      this.height = height;
      this.contourData = contourData; // This will hold the raw contour data
    }
  }

  

  function renderPatternList() {
    const listContainer = document.getElementById('pattern-list');
    // Remove existing pattern rows (except the "Add Pattern" button)
    listContainer.querySelectorAll('.pattern-row').forEach(el => el.remove());
    
    project.patterns.forEach((pattern, index) => {
      const row = document.createElement('div');
      row.classList.add('pattern-row');
      row.setAttribute('data-index', index);
      
      row.innerHTML = `
        <canvas class="pattern-preview" width="350" height="150"></canvas>
        <input type="text" class="pattern-description" placeholder="Description" value="${pattern.description}">
        <label>Width</label>
        <input type="number" class="pattern-width" placeholder="Width" value="${pattern.width}">
        <label>Height</label>
        <input type="number" class="pattern-height" placeholder="Height" value="${pattern.height}">
        <div class="row-buttons-container">
        <button class="open-camera-for-pattern"><i data-lucide="camera"></i></button>
        <button class="remove-pattern"><i data-lucide="trash-2"></i></button>
        <button class="move-up"><i data-lucide="chevron-up"></i></button>
        <button class="move-down"><i data-lucide="chevron-down"></i></button>
        </div>
      `;
      
      // Update pattern values on input change
      row.querySelector('.pattern-description').addEventListener('input', e => {
        project.patterns[index].description = e.target.value;
      });
      row.querySelector('.pattern-width').addEventListener('input', e => {
        project.patterns[index].width = parseFloat(e.target.value);
      });
      row.querySelector('.pattern-height').addEventListener('input', e => {
        project.patterns[index].height = parseFloat(e.target.value);
      });
      
      // Set up the camera button for this pattern
      row.querySelector('.open-camera-for-pattern').addEventListener('click', () => {
        activePatternIndex = index;
        document.getElementById('camera-view').classList.remove('hidden');
      });
      
      // Remove pattern
      row.querySelector('.remove-pattern').addEventListener('click', () => {
        project.patterns.splice(index, 1);
        renderPatternList();
      });
      
      // Move up/down functionality
      row.querySelector('.move-up').addEventListener('click', () => {
        if (index > 0) {
          [project.patterns[index - 1], project.patterns[index]] = [project.patterns[index], project.patterns[index - 1]];
          renderPatternList();
        }
      });
      row.querySelector('.move-down').addEventListener('click', () => {
        if (index < project.patterns.length - 1) {
          [project.patterns[index + 1], project.patterns[index]] = [project.patterns[index], project.patterns[index + 1]];
          renderPatternList();
        }
      });
      
      // Draw contour preview if available
      const previewCanvas = row.querySelector('.pattern-preview');
      if (pattern.contourData) {
        drawContourOnCanvas(previewCanvas, pattern.contourData);
      } else {
        // Clear canvas or show a placeholder
        const ctx = previewCanvas.getContext("2d");
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
      }
      
      // Insert the row before the "Add Pattern" button
      listContainer.insertBefore(row, document.getElementById('add-pattern'));
      lucide.createIcons();
    });
  }
  
  document.getElementById('add-pattern').addEventListener('click', () => {
    project.patterns.push(new Pattern());
    renderPatternList();
    lucide.createIcons();
  });
  
  function drawContourOnCanvas(canvas, contourData) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!contourData || contourData.length === 0) return;
    
    // Calculate bounding box of the contour data
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    contourData.forEach(pt => {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    });
    
    const contourWidth = maxX - minX;
    const contourHeight = maxY - minY;
    
    // Determine scale to fit the canvas dimensions
    const scaleX = canvas.width / contourWidth;
    const scaleY = canvas.height / contourHeight;
    const scale = Math.min(scaleX, scaleY);
    
    // Calculate offsets to center the drawing
    const offsetX = (canvas.width - contourWidth * scale) / 2;
    const offsetY = (canvas.height - contourHeight * scale) / 2;
    
    // Begin drawing the contour path
    ctx.beginPath();
    const firstPoint = contourData[0];
    ctx.moveTo((firstPoint.x - minX) * scale + offsetX, (firstPoint.y - minY) * scale + offsetY);
    for (let i = 1; i < contourData.length; i++) {
      const pt = contourData[i];
      ctx.lineTo((pt.x - minX) * scale + offsetX, (pt.y - minY) * scale + offsetY);
    }
    ctx.closePath();
    ctx.strokeStyle = "black";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  
  
  
  
  
  


  //document.getElementById('capture-process').addEventListener('click', () => {
    // Implement your function to convert contours to a simple data format
    // For instance, convertContoursToData() might return an array of points.
   // const contourData = convertContoursToData(); 
    
    // Save the contour data to the active pattern
   // if (activePatternIndex !== null) {
   //   project.patterns[activePatternIndex].contourData = contourData;
   //   renderPatternList();
   //   activePatternIndex = null;
   // }
    
    // Hide the camera view
  //  document.getElementById('camera-view').classList.add('hidden');
 // });
  
    
