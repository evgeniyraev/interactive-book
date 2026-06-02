(function initializeWebGLPageTurn() {
  const GRID_COLUMNS = 72;
  const GRID_ROWS = 18;
  const MAX_CAPTURE_PIXEL_RATIO = 2;
  const TRANSPARENT_PIXEL = new Uint8Array([255, 255, 255, 0]);

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function waitForImage(image) {
    if (!image) {
      return Promise.reject(new Error('Missing image element.'));
    }

    if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
      return Promise.resolve();
    }

    if (typeof image.decode === 'function') {
      return image.decode().catch(() => {});
    }

    return new Promise((resolve, reject) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', reject, { once: true });
    });
  }

  function drawFittedImage(context, image, width, height, fit) {
    const sourceWidth = image.naturalWidth || image.videoWidth || image.width;
    const sourceHeight = image.naturalHeight || image.videoHeight || image.height;
    if (!sourceWidth || !sourceHeight) {
      return;
    }

    const scale = fit === 'cover'
      ? Math.max(width / sourceWidth, height / sourceHeight)
      : Math.min(width / sourceWidth, height / sourceHeight);
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const drawX = (width - drawWidth) / 2;
    const drawY = (height - drawHeight) / 2;

    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  }

  function isDrawableColor(value) {
    return Boolean(
      value &&
      value !== 'transparent' &&
      value !== 'rgba(0, 0, 0, 0)' &&
      value !== 'rgba(0,0,0,0)'
    );
  }

  function rectForElement(element, origin) {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left - origin.left,
      y: rect.top - origin.top,
      width: rect.width,
      height: rect.height
    };
  }

  function drawBorderSide(context, x, y, width, height, color) {
    if (width <= 0 || height <= 0 || !isDrawableColor(color)) {
      return;
    }

    context.fillStyle = color;
    context.fillRect(x, y, width, height);
  }

  function drawElementBox(context, element, origin) {
    const rect = rectForElement(element, origin);
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const style = window.getComputedStyle(element);
    if (isDrawableColor(style.backgroundColor)) {
      context.fillStyle = style.backgroundColor;
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
    }

    const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
    const borderRight = Number.parseFloat(style.borderRightWidth) || 0;
    const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;
    const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;

    drawBorderSide(context, rect.x, rect.y, rect.width, borderTop, style.borderTopColor);
    drawBorderSide(
      context,
      rect.x + rect.width - borderRight,
      rect.y,
      borderRight,
      rect.height,
      style.borderRightColor
    );
    drawBorderSide(
      context,
      rect.x,
      rect.y + rect.height - borderBottom,
      rect.width,
      borderBottom,
      style.borderBottomColor
    );
    drawBorderSide(context, rect.x, rect.y, borderLeft, rect.height, style.borderLeftColor);
  }

  function drawElementBoxes(context, root, origin) {
    drawElementBox(context, root, origin);
    root.querySelectorAll('*').forEach((element) => {
      drawElementBox(context, element, origin);
    });
  }

  function createCaptureCanvas(width, height, pixelRatio) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext('2d', { alpha: true });
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    return { canvas, context };
  }

  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(String(reader.result || '')));
      reader.addEventListener('error', reject);
      reader.readAsDataURL(blob);
    });
  }

  async function imageSourceToDataUrl(src) {
    if (!src || src.startsWith('data:')) {
      return src;
    }

    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`Could not load page image: ${response.status}`);
    }

    return blobToDataUrl(await response.blob());
  }

  async function loadImageFromUrl(url) {
    const image = new Image();
    image.decoding = 'async';

    const loaded = new Promise((resolve, reject) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', reject, { once: true });
    });

    image.src = url;
    await loaded;
    return image;
  }

  async function loadDrawableImage(image) {
    const src = image.currentSrc || image.getAttribute('src') || '';
    try {
      const dataUrl = await imageSourceToDataUrl(src);
      if (dataUrl && dataUrl !== src) {
        return loadImageFromUrl(dataUrl);
      }
    } catch (error) {
      console.warn('Could not convert image to a texture-safe data URL:', error);
    }

    await waitForImage(image);
    return image;
  }

  async function drawDomImages(context, root, origin) {
    const images = Array.from(root.querySelectorAll('img'));
    await Promise.all(images.map(async (image) => {
      const rect = rectForElement(image, origin);
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      const drawable = await loadDrawableImage(image);
      const style = window.getComputedStyle(image);
      const fit = style.objectFit === 'cover' ? 'cover' : 'contain';
      context.save();
      context.beginPath();
      context.rect(rect.x, rect.y, rect.width, rect.height);
      context.clip();
      context.translate(rect.x, rect.y);
      drawFittedImage(context, drawable, rect.width, rect.height, fit);
      context.restore();
    }));
  }

  function fontForElement(element) {
    const style = window.getComputedStyle(element);
    return style.font || `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  }

  function drawTextDecoration(context, rect, style) {
    if (!String(style.textDecorationLine || '').includes('underline')) {
      return;
    }

    const thickness = Math.max(1, (Number.parseFloat(style.fontSize) || 16) / 16);
    context.fillStyle = style.textDecorationColor || style.color;
    context.fillRect(rect.x, rect.y + rect.height - thickness, rect.width, thickness);
  }

  function drawTextNodes(context, root, origin) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();

    context.textBaseline = 'top';

    try {
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const text = node.textContent || '';
        const parent = node.parentElement;
        if (!parent || !text.trim()) {
          continue;
        }

        const style = window.getComputedStyle(parent);
        if (!isDrawableColor(style.color)) {
          continue;
        }

        context.font = fontForElement(parent);
        context.fillStyle = style.color;

        for (let index = 0; index < text.length; index += 1) {
          const char = text[index];
          if (!char || char === '\n' || char === '\r' || char === '\t') {
            continue;
          }

          range.setStart(node, index);
          range.setEnd(node, index + 1);
          const rect = range.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) {
            continue;
          }

          const localRect = {
            x: rect.left - origin.left,
            y: rect.top - origin.top,
            width: rect.width,
            height: rect.height
          };

          context.fillText(char, localRect.x, localRect.y);
          drawTextDecoration(context, localRect, style);
        }
      }
    } finally {
      range.detach?.();
    }
  }

  async function captureImagePage(element, width, height, pixelRatio) {
    const image = element.querySelector('.page-content.image img, .page-content.pdf-page img');
    if (!image) {
      return null;
    }

    await waitForImage(image);

    const { canvas, context } = createCaptureCanvas(width, height, pixelRatio);
    const background = window.getComputedStyle(element).backgroundColor || '#ffffff';
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    const fit = image.closest('.page-content.image') ? 'cover' : 'contain';
    const drawable = await loadDrawableImage(image);
    drawFittedImage(context, drawable, width, height, fit);
    return canvas;
  }

  async function captureHtmlPage(element, width, height, pixelRatio) {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const { canvas, context } = createCaptureCanvas(width, height, pixelRatio);
    const origin = element.getBoundingClientRect();
    context.clearRect(0, 0, width, height);
    drawElementBoxes(context, element, origin);
    await drawDomImages(context, element, origin);
    drawTextNodes(context, element, origin);
    return canvas;
  }

  async function capturePageFace(element, pixelRatio) {
    const rect = element.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    const imageCanvas = await captureImagePage(element, width, height, pixelRatio).catch(() => null);
    if (imageCanvas) {
      return { canvas: imageCanvas, width, height };
    }

    const htmlCanvas = await captureHtmlPage(element, width, height, pixelRatio);
    return { canvas: htmlCanvas, width, height };
  }

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || 'Unknown shader error.';
      gl.deleteShader(shader);
      throw new Error(message);
    }

    return shader;
  }

  function createProgram(gl, vertexSource, fragmentSource) {
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || 'Unknown program link error.';
      gl.deleteProgram(program);
      throw new Error(message);
    }

    return program;
  }

  class WebGLPageTurn {
    static isSupported() {
      try {
        const canvas = document.createElement('canvas');
        return Boolean(
          canvas.getContext('webgl', { alpha: true }) ||
          canvas.getContext('experimental-webgl', { alpha: true })
        );
      } catch {
        return false;
      }
    }

    constructor(shellElement) {
      this.shellElement = shellElement;
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'webgl-page-turn-canvas';
      this.canvas.setAttribute('aria-hidden', 'true');
      this.canvas.style.display = 'none';
      this.shellElement.append(this.canvas);

      this.gl =
        this.canvas.getContext('webgl', {
          alpha: true,
          antialias: true,
          depth: false,
          premultipliedAlpha: true,
          preserveDrawingBuffer: false
        }) ||
        this.canvas.getContext('experimental-webgl', {
          alpha: true,
          antialias: true,
          depth: false,
          premultipliedAlpha: true,
          preserveDrawingBuffer: false
        });

      if (!this.gl) {
        throw new Error('WebGL is not available.');
      }

      this.pixelRatio = 1;
      this.viewWidth = 1;
      this.viewHeight = 1;
      this.pageWidth = 1;
      this.pageHeight = 1;
      this.indexCount = 0;
      this.active = null;

      this.initProgram();
      this.initGeometry();
      this.initTextureFallback();
    }

    initProgram() {
      const vertexSource = `
        precision mediump float;

        attribute vec2 a_position;
        attribute vec2 a_texCoord;

        uniform vec2 u_viewSize;
        uniform vec2 u_pageSize;
        uniform float u_progress;
        uniform float u_direction;
        uniform float u_texMirror;

        varying vec2 v_texCoord;
        varying float v_bend;
        varying float v_edge;

        void main() {
          float p = clamp(u_progress, 0.0, 1.0);
          float localX = a_position.x;
          float localY = a_position.y;
          float u = localX / max(1.0, u_pageSize.x);
          float v = localY / max(1.0, u_pageSize.y);
          float turnAngle = -u_direction * 3.141592653589793 * p;
          float c = cos(turnAngle);
          float s = sin(turnAngle);
          float bend = sin(3.141592653589793 * p);
          float wave = sin(3.141592653589793 * u);
          float spineX = u_viewSize.x * 0.5;

          float x = spineX + u_direction * localX * c;
          float z = -u_direction * localX * s;
          z += wave * bend * u_pageSize.x * 0.16;
          x += u_direction * wave * bend * u_pageSize.x * 0.025;

          float y = localY + (v - 0.5) * wave * bend * u_pageSize.y * 0.025;
          float camera = 2800.0;
          float scale = camera / max(1.0, camera - z);
          vec2 center = vec2(u_viewSize.x * 0.5, u_viewSize.y * 0.5);
          vec2 projected = center + (vec2(x, y) - center) * scale;
          vec2 clip = vec2(
            projected.x / u_viewSize.x * 2.0 - 1.0,
            1.0 - projected.y / u_viewSize.y * 2.0
          );

          gl_Position = vec4(clip, clamp(z / camera, -1.0, 1.0), 1.0);
          v_texCoord = vec2(mix(a_texCoord.x, 1.0 - a_texCoord.x, u_texMirror), a_texCoord.y);
          v_bend = bend;
          v_edge = wave;
        }
      `;

      const fragmentSource = `
        precision mediump float;

        uniform sampler2D u_texture;
        uniform float u_progress;
        uniform float u_side;

        varying vec2 v_texCoord;
        varying float v_bend;
        varying float v_edge;

        void main() {
          vec4 color = texture2D(u_texture, v_texCoord);
          float frontVisibility = 1.0 - smoothstep(0.43, 0.57, u_progress);
          float backVisibility = smoothstep(0.43, 0.57, u_progress);
          float sideVisibility = mix(frontVisibility, backVisibility, u_side);
          float curlShade = v_bend * v_edge;
          float darken = mix(0.26, 0.18, u_side) * curlShade;
          float highlight = mix(0.04, 0.10, u_side) * curlShade;

          color.rgb = color.rgb * (1.0 - darken) + vec3(highlight);
          color.a *= sideVisibility;

          if (color.a < 0.01) {
            discard;
          }

          gl_FragColor = color;
        }
      `;

      const gl = this.gl;
      this.program = createProgram(gl, vertexSource, fragmentSource);
      this.locations = {
        position: gl.getAttribLocation(this.program, 'a_position'),
        texCoord: gl.getAttribLocation(this.program, 'a_texCoord'),
        viewSize: gl.getUniformLocation(this.program, 'u_viewSize'),
        pageSize: gl.getUniformLocation(this.program, 'u_pageSize'),
        progress: gl.getUniformLocation(this.program, 'u_progress'),
        direction: gl.getUniformLocation(this.program, 'u_direction'),
        texMirror: gl.getUniformLocation(this.program, 'u_texMirror'),
        texture: gl.getUniformLocation(this.program, 'u_texture'),
        side: gl.getUniformLocation(this.program, 'u_side')
      };
    }

    initGeometry() {
      const positions = [];
      const texCoords = [];
      const indices = [];

      for (let row = 0; row <= GRID_ROWS; row += 1) {
        const v = row / GRID_ROWS;
        for (let column = 0; column <= GRID_COLUMNS; column += 1) {
          const u = column / GRID_COLUMNS;
          positions.push(u, v);
          texCoords.push(u, v);
        }
      }

      const rowSize = GRID_COLUMNS + 1;
      for (let row = 0; row < GRID_ROWS; row += 1) {
        for (let column = 0; column < GRID_COLUMNS; column += 1) {
          const topLeft = row * rowSize + column;
          const topRight = topLeft + 1;
          const bottomLeft = topLeft + rowSize;
          const bottomRight = bottomLeft + 1;
          indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
        }
      }

      const gl = this.gl;
      this.positionBuffer = gl.createBuffer();
      this.texCoordBuffer = gl.createBuffer();
      this.indexBuffer = gl.createBuffer();
      this.basePositions = new Float32Array(positions);
      this.texCoords = new Float32Array(texCoords);
      this.indices = new Uint16Array(indices);
      this.indexCount = this.indices.length;

      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.texCoords, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, gl.STATIC_DRAW);
    }

    initTextureFallback() {
      const gl = this.gl;
      this.emptyTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.emptyTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        TRANSPARENT_PIXEL
      );
    }

    resize() {
      const rect = this.shellElement.getBoundingClientRect();
      this.viewWidth = Math.max(1, Math.round(rect.width));
      this.viewHeight = Math.max(1, Math.round(rect.height));
      this.pixelRatio = clamp(window.devicePixelRatio || 1, 1, MAX_CAPTURE_PIXEL_RATIO);

      const targetWidth = Math.max(1, Math.round(this.viewWidth * this.pixelRatio));
      const targetHeight = Math.max(1, Math.round(this.viewHeight * this.pixelRatio));
      if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
        this.canvas.width = targetWidth;
        this.canvas.height = targetHeight;
      }

      this.canvas.style.width = `${this.viewWidth}px`;
      this.canvas.style.height = `${this.viewHeight}px`;
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    createTexture(source) {
      const gl = this.gl;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      return texture;
    }

    updatePositionBuffer() {
      const scaled = new Float32Array(this.basePositions.length);
      for (let index = 0; index < this.basePositions.length; index += 2) {
        scaled[index] = this.basePositions[index] * this.pageWidth;
        scaled[index + 1] = this.basePositions[index + 1] * this.pageHeight;
      }

      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, scaled, gl.DYNAMIC_DRAW);
    }

    async start(options) {
      this.resize();

      const pixelRatio = this.pixelRatio;
      const [frontCapture, backCapture] = await Promise.all([
        capturePageFace(options.frontElement, pixelRatio),
        capturePageFace(options.backElement, pixelRatio)
      ]);

      if (!frontCapture?.canvas || !backCapture?.canvas) {
        throw new Error('Could not capture page faces for WebGL turn.');
      }

      this.stop();
      this.pageWidth = Math.max(1, frontCapture.width);
      this.pageHeight = Math.max(1, frontCapture.height);
      this.updatePositionBuffer();

      this.active = {
        direction: options.direction === 'backward' ? -1 : 1,
        frontTexture: this.createTexture(frontCapture.canvas),
        backTexture: this.createTexture(backCapture.canvas)
      };

      this.canvas.style.display = 'block';
      this.render(0);
    }

    drawTexture(texture, side, progress) {
      const gl = this.gl;
      const direction = this.active?.direction || 1;
      const mirror =
        (side === 0 && direction < 0) ||
        (side === 1 && direction > 0)
          ? 1
          : 0;

      gl.useProgram(this.program);
      gl.uniform2f(this.locations.viewSize, this.viewWidth, this.viewHeight);
      gl.uniform2f(this.locations.pageSize, this.pageWidth, this.pageHeight);
      gl.uniform1f(this.locations.progress, progress);
      gl.uniform1f(this.locations.direction, direction);
      gl.uniform1f(this.locations.texMirror, mirror);
      gl.uniform1f(this.locations.side, side);
      gl.uniform1i(this.locations.texture, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture || this.emptyTexture);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.enableVertexAttribArray(this.locations.position);
      gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
      gl.enableVertexAttribArray(this.locations.texCoord);
      gl.vertexAttribPointer(this.locations.texCoord, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
    }

    render(progress) {
      if (!this.active) {
        return;
      }

      this.resize();
      const gl = this.gl;
      const value = clamp(progress, 0, 1);

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      this.drawTexture(this.active.frontTexture, 0, value);
      this.drawTexture(this.active.backTexture, 1, value);
    }

    stop() {
      if (this.active) {
        const gl = this.gl;
        gl.deleteTexture(this.active.frontTexture);
        gl.deleteTexture(this.active.backTexture);
      }

      this.active = null;
      this.canvas.style.display = 'none';
      this.gl.clearColor(0, 0, 0, 0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }
  }

  window.WebGLPageTurn = WebGLPageTurn;
})();
