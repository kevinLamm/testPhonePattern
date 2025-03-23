let video = document.createElement("video"); // Hidden video element
let canvas = document.getElementById("canvas");  // Visible canvas for display
let processingCanvas = document.getElementById("processing-canvas"); // Offscreen canvas for processing
let ctx = canvas.getContext("2d");
let captureButton = document.getElementById("capture-process");
let activePatternIndex = null;
let largestContourVector = null;

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
  
  document.getElementById('close-camera').addEventListener('click', () => {
    document.getElementById('camera-view').classList.add('hidden');
    largestContourVector = null;
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

function processFrame() {
    if (!processing) return;

    // Draw the video frame to the hidden processing canvas
    let pctx = processingCanvas.getContext("2d");
    pctx.drawImage(video, 0, 0, processingCanvas.width, processingCanvas.height);

    // Read the frame from the processing canvas
    let src = cv.imread(processingCanvas);
    let gray = new cv.Mat();
    let thresh = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.threshold(gray, thresh, 128, 255, cv.THRESH_BINARY);

    // Find contours
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
        let edges = new cv.Mat();
        cv.Canny(thresh, edges, 50, 150);
        let largestContourVector = new cv.MatVector();
        largestContourVector.push_back(largestContour);

        let color = new cv.Scalar(255, 0, 255, 255); // Magenta color
        cv.drawContours(src, largestContourVector, 0, color, 2);
        largestContourVector.delete();
        edges.delete();
    }

    // Display the processed frame on the visible canvas
    cv.imshow("canvas", src);

    // Draw crosshairs on the visible canvas
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

function updateDebugLabel(message) {
    const debugLabel = document.getElementById('debug-label');
    debugLabel.textContent = message;
}


captureButton.addEventListener("click", captureProcess);
captureButton.addEventListener("touchstart", captureProcess);

function captureProcess(event) {
    // Prevent the default behavior of the event for touch
    event.preventDefault();

    updateDebugLabel("Capture & Process button clicked!");
    
    // Use the processing canvas to read the current frame
    let src = cv.imread(processingCanvas);
    updateDebugLabel("Image captured successfully.");

    let gray = new cv.Mat();
    let thresh = new cv.Mat();

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

    updateDebugLabel(contours.size());

    if (largestContour) {
        updateDebugLabel("Got largest contour.");

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
            let topPoints = points.slice(0, 2).sort((a, b) => a.x - b.x);
            let bottomPoints = points.slice(2).sort((a, b) => a.x - b.x);
            let topLeft = topPoints[0], topRight = topPoints[1];
            let bottomLeft = bottomPoints[0], bottomRight = bottomPoints[1];

            let srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
                topLeft.x, topLeft.y,
                topRight.x, topRight.y,
                bottomRight.x, bottomRight.y,
                bottomLeft.x, bottomLeft.y
            ]);
            let dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
                0, 0,
                processingCanvas.width, 0,
                processingCanvas.width, processingCanvas.height,
                0, processingCanvas.height
            ]);

            let matrix = cv.getPerspectiveTransform(srcPts, dstPts);

            let warped = new cv.Mat();
            cv.warpPerspective(src, warped, matrix, new cv.Size(processingCanvas.width, processingCanvas.height));

            let warpedContourData = [];
            let numPoints = largestContour.data32S.length / 2;
            let m = matrix.data64F;
            for (let i = 0; i < numPoints; i++) {
                let x = largestContour.data32S[i * 2];
                let y = largestContour.data32S[i * 2 + 1];
                let denominator = m[6] * x + m[7] * y + m[8];
                let warpedX = (m[0] * x + m[1] * y + m[2]) / denominator;
                let warpedY = (m[3] * x + m[4] * y + m[5]) / denominator;
                warpedContourData.push({ x: warpedX, y: warpedY });
            }
            updateDebugLabel("warp completed.");
            
            //if (activePatternIndex !== null) {
                project.patterns[activePatternIndex].contourData = warpedContourData;
            //}

            updateDebugLabel("added contour data to pattern");
        
            renderPatternList();
          //  activePatternIndex = null;

            srcPts.delete();
            dstPts.delete();
            matrix.delete();
            warped.delete();

           
           
        }
        approx.delete();
       
       
    } else {
        console.log("No contour found.");
        updateDebugLabel("No contour found.");
       
    }

    src.delete();
    gray.delete();
    thresh.delete();
    contours.delete();
    hierarchy.delete();

    
    document.getElementById('camera-view').classList.add('hidden');
};



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
  
    
