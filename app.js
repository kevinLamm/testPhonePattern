let video = document.createElement("video"); // Hidden video element
let canvas = document.getElementById("canvas");

let ctx = canvas.getContext("2d");
let captureButton = document.createElement("button");
captureButton.innerText = "Capture & Process";
let cameraView = document.getElementById("camera-view");
cameraView.appendChild(captureButton);
let activePatternIndex = null;

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

// Start with the back camera
startCamera("environment");

// Capture and process the largest centered object
captureButton.addEventListener("click", () => {
    // Read the current frame from the canvas
    let src = cv.imread(canvas);
    let gray = new cv.Mat();
    let thresh = new cv.Mat();

    // Convert to grayscale and threshold
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.threshold(gray, thresh, 128, 255, cv.THRESH_BINARY);

    // Find contours in the thresholded image
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
        // Approximate the contour to a quadrilateral
        let approx = new cv.Mat();
        let peri = cv.arcLength(largestContour, true);
        cv.approxPolyDP(largestContour, approx, 0.02 * peri, true);

        if (approx.rows === 4) {
            // Get the four points and sort them to determine corners
            let points = [];
            for (let i = 0; i < 4; i++) {
                let x = approx.data32S[i * 2];
                let y = approx.data32S[i * 2 + 1];
                points.push({ x, y });
            }
            // Sort points by y-coordinate to separate top and bottom points
            points.sort((a, b) => a.y - b.y);
            let topPoints = points.slice(0, 2).sort((a, b) => a.x - b.x);
            let bottomPoints = points.slice(2).sort((a, b) => a.x - b.x);
            let topLeft = topPoints[0], topRight = topPoints[1];
            let bottomLeft = bottomPoints[0], bottomRight = bottomPoints[1];

            // Define source and destination points for perspective transform
            let srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
                topLeft.x, topLeft.y,
                topRight.x, topRight.y,
                bottomRight.x, bottomRight.y,
                bottomLeft.x, bottomLeft.y
            ]);
            let dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
                0, 0,
                canvas.width, 0,
                canvas.width, canvas.height,
                0, canvas.height
            ]);

            // Compute perspective transform matrix
            let matrix = cv.getPerspectiveTransform(srcPts, dstPts);

            // Warp the source image for preview
            let warped = new cv.Mat();
            cv.warpPerspective(src, warped, matrix, new cv.Size(canvas.width, canvas.height));

            // Compute the warped contour data:
            // For each point in the original largestContour, apply the perspective transform.
            let warpedContourData = [];
            // Ensure we treat the contour points as floats
            let numPoints = largestContour.data32S.length / 2;
            // Access the transform matrix data (assumed to be CV_64F)
            let m = matrix.data64F;
            for (let i = 0; i < numPoints; i++) {
                let x = largestContour.data32S[i * 2];
                let y = largestContour.data32S[i * 2 + 1];
                // Apply perspective transform:
                let denominator = m[6] * x + m[7] * y + m[8];
                let warpedX = (m[0] * x + m[1] * y + m[2]) / denominator;
                let warpedY = (m[3] * x + m[4] * y + m[5]) / denominator;
                warpedContourData.push({ x: warpedX, y: warpedY });
            }

            // Draw the warped contour on the preview canvas for feedback
            let color = new cv.Scalar(0, 255, 0, 255);
            let contourVec = new cv.MatVector();
            contourVec.push_back(largestContour);
            cv.drawContours(warped, contourVec, 0, color, 2);
            cv.imshow("canvas", warped);
            contourVec.delete();

            // Store the warped contour data in the active pattern
            if (activePatternIndex !== null) {
                project.patterns[activePatternIndex].contourData = warpedContourData;
            }
            
            // Update the pattern list so that the preview canvas is refreshed
            renderPatternList();

            // Clean up: reset active pattern index and hide camera view
            activePatternIndex = null;
            document.getElementById('camera-view').classList.add('hidden');

            // Cleanup temporary Mats
            srcPts.delete();
            dstPts.delete();
            matrix.delete();
            warped.delete();
        }
        approx.delete();
    } else {
        console.log("No contour found.");
    }

    // Cleanup
    src.delete();
    gray.delete();
    thresh.delete();
    contours.delete();
    hierarchy.delete();
});




class Pattern {
    constructor(description = "", width = 0, height = 0, contourData = null) {
      this.description = description;
      this.width = width;
      this.height = height;
      this.contourData = contourData; // This will hold the raw contour data
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Initialize global project variable
    window.project = {
      name: "",
      patterns: []
    };
  
  document.getElementById('menu-btn').addEventListener('click', () => {
    const menu = document.getElementById('menu-nav');
    menu.classList.toggle('hidden');
  });
  
  document.getElementById('new-project').addEventListener('click', () => {
    project.name = "";
    project.patterns = [];
    document.getElementById('project-name').value = "";
    renderPatternList();
  });
  
  document.getElementById('open-project').addEventListener('click', () => {
    // Add logic to load a project (e.g., from local storage or file upload)
    alert("Open Project functionality goes here.");
  });
  
  document.getElementById('save-project').addEventListener('click', () => {
    // Add logic to save the project (e.g., download JSON or use local storage)
    alert("Save Project functionality goes here.");
  });
  
  document.getElementById('share-project').addEventListener('click', () => {
    // Implement share (e.g., generate shareable link or JSON export)
    alert("Share Project functionality goes here.");
  });
  
  document.getElementById('settings-btn').addEventListener('click', () => {
    // Open settings modal or navigate to settings page
    alert("Settings functionality goes here.");
  });

});

  function renderPatternList() {
    const listContainer = document.getElementById('pattern-list');
    // Remove existing pattern rows (except the "Add Pattern" button)
    listContainer.querySelectorAll('.pattern-row').forEach(el => el.remove());
    
    project.patterns.forEach((pattern, index) => {
      const row = document.createElement('div');
      row.classList.add('pattern-row');
      row.setAttribute('data-index', index);
      
      row.innerHTML = `
        <input type="text" class="pattern-description" placeholder="Description" value="${pattern.description}">
        <input type="number" class="pattern-width" placeholder="Width" value="${pattern.width}">
        <input type="number" class="pattern-height" placeholder="Height" value="${pattern.height}">
        <canvas class="pattern-preview" width="100" height="100"></canvas>
        <button class="open-camera-for-pattern">Capture Image</button>
        <button class="remove-pattern">Remove</button>
        <button class="move-up">↑</button>
        <button class="move-down">↓</button>
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
        ctx.fillStyle = "#ccc";
        ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
      }
      
      // Insert the row before the "Add Pattern" button
      listContainer.insertBefore(row, document.getElementById('add-pattern'));
    });
  }
  
  document.getElementById('add-pattern').addEventListener('click', () => {
    project.patterns.push(new Pattern());
    renderPatternList();
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
    ctx.strokeStyle = "blue";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  
  
  
  
  
  


  document.getElementById('capture-process').addEventListener('click', () => {
    // Implement your function to convert contours to a simple data format
    // For instance, convertContoursToData() might return an array of points.
    const contourData = convertContoursToData(); 
    
    // Save the contour data to the active pattern
    if (activePatternIndex !== null) {
      project.patterns[activePatternIndex].contourData = contourData;
      renderPatternList();
      activePatternIndex = null;
    }
    
    // Hide the camera view
    document.getElementById('camera-view').classList.add('hidden');
  });
  
    
