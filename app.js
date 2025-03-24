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
  console.log("aruco installed: ", window.jsAruco);
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


function updateDebugLabel(message) {
    const debugLabel = document.getElementById('debug-label');
    debugLabel.textContent = message;
}

function processFrame() {
    if (!processing) return;

    // Draw the current video frame onto the hidden processing canvas.
    let pctx = processingCanvas.getContext("2d");
    pctx.drawImage(video, 0, 0, processingCanvas.width, processingCanvas.height);

    // Get the ImageData from the processing canvas for js-aruco detection.
    let imageData = pctx.getImageData(0, 0, processingCanvas.width, processingCanvas.height);

    // Also read the frame into an OpenCV Mat for drawing and further processing.
    let src = cv.imread(processingCanvas);
    let gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // -------- Marker Detection & Pose Estimation using js-aruco --------
    try {
        // Create an AR.Detector from js-aruco.
        // (Assuming js-aruco attaches AR to the global namespace.)
        var detector = new jsAruco.AR.Detector();
        let markers = detector.detect(imageData);

        if (markers.length > 0) {
            // Use the first detected marker.
            let marker = markers[0];
            updateDebugLabel("Marker detected with ID: " + marker.id);

            // Draw the marker's outline (green) on the frame.
            let corners = marker.corners;
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

            // ---- 3D Pose Estimation using js-aruco's POS ----
            // The POS library requires marker corner coordinates to be centered.
            let adjustedCorners = [];
            for (let i = 0; i < corners.length; i++) {
                adjustedCorners.push({
                    x: corners[i].x - (canvas.width / 2),
                    y: (canvas.height / 2) - corners[i].y
                });
            }
            let modelSize = 101.6; // Marker size in millimeters.
            // Create a POS.Posit object (using, for example, POS1 version).
            var posit = new POS.Posit(modelSize, canvas.width);
            var pose = posit.pose(adjustedCorners);

            // For drawing axes, we need to project 3D points using the estimated pose.
            // We'll define a simple projection function. (This is an approximation.)
            function projectPoint(point3d, R, t, f, cx, cy) {
                // Apply rotation and translation: p_3d = R * point + t.
                // Here, R is a 3x3 matrix and t is a 3-element vector.
                let X = R[0][0] * point3d.x + R[0][1] * point3d.y + R[0][2] * point3d.z + t[0];
                let Y = R[1][0] * point3d.x + R[1][1] * point3d.y + R[1][2] * point3d.z + t[1];
                let Z = R[2][0] * point3d.x + R[2][1] * point3d.y + R[2][2] * point3d.z + t[2];
                // Avoid division by zero.
                if (Z === 0) { Z = 0.0001; }
                return new cv.Point(
                    Math.round(f * (X / Z) + cx),
                    Math.round(f * (Y / Z) + cy)
                );
            }
            // Define camera parameters approximately.
            let f = canvas.width; // Approximate focal length.
            let cx = canvas.width / 2;
            let cy = canvas.height / 2;
            // Define 3D points for axes in marker coordinate space.
            let origin3D = { x: 0, y: 0, z: 0 };
            let xAxis3D = { x: modelSize, y: 0, z: 0 };
            let yAxis3D = { x: 0, y: modelSize, z: 0 };
            let zAxis3D = { x: 0, y: 0, z: -modelSize };

            // The js-aruco POS library returns pose.bestRotation and pose.bestTranslation.
            // These are used as the 3x3 rotation matrix and translation vector.
            // Depending on the library version, they might be in a flat array; adjust if necessary.
            let R = pose.bestRotation; // Expected as a 3x3 nested array.
            let t = pose.bestTranslation; // Expected as an array of length 3.

            // Project the endpoints.
            let origin2D = projectPoint(origin3D, R, t, f, cx, cy);
            let xAxis2D = projectPoint(xAxis3D, R, t, f, cx, cy);
            let yAxis2D = projectPoint(yAxis3D, R, t, f, cx, cy);
            let zAxis2D = projectPoint(zAxis3D, R, t, f, cx, cy);

            // Draw axes: x (red), y (green), z (blue)
            cv.line(src, origin2D, xAxis2D, new cv.Scalar(255, 0, 0, 255), 2);
            cv.line(src, origin2D, yAxis2D, new cv.Scalar(0, 255, 0, 255), 2);
            cv.line(src, origin2D, zAxis2D, new cv.Scalar(0, 0, 255, 255), 2);
        } else {
            updateDebugLabel("No marker detected in this frame.");
        }
    } catch (err) {
        updateDebugLabel("Error in marker detection/pose: " + err);
    }

    // -------- Largest Contour Detection (same as original) --------
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

    // -------- Display Processed Frame --------
    cv.imshow("canvas", src);

    // -------- Draw Crosshairs on Top --------
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

    // Cleanup Mats
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
  
    
