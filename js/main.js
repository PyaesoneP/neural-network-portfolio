        // ============================================
        // CONFIGURATION
        // ============================================
        
        const config = {
            layerGap: 10,
            nodeSpacing: 3.2,
            nodeSize: 0.55,
            particleCount: window.innerWidth < 768 ? 600 : 1200, // Reduce particles on mobile
            dataPacketSpeed: 0.018
        };

        let networkData = null;

        async function loadNetworkData() {
            const response = await fetch('data/network.json');
            if (!response.ok) throw new Error('Failed to load network data: ' + response.status);
            networkData = await response.json();
        }

        // ============================================
        // THREE.JS VARIABLES
        // ============================================
        
        let scene, camera, renderer, raycaster, mouse;
        let nodes = [], connections = [], dataPackets = [], orbitalRings = [], nodeLabels = [];
        let timelineMarkers = [], timelineLines = [];
        let particlesSystem, gridLines;
        let time = 0;
        
        let hoveredNode = null, selectedNode = null;
        let isDragging = false, previousMousePosition = { x: 0, y: 0 };
        let autoRotate = false;
        let cameraAngleX = 0, cameraAngleY = 0.2, cameraDistance = 38;
        let cameraTarget = new THREE.Vector3(0, 0, 0);
        let targetCameraAngleX = 0, targetCameraAngleY = 0.2, targetCameraDistance = 38;
        let targetCameraTarget = new THREE.Vector3(0, 0, 0);
        
        let currentView = 'network';
        let targetPositions = {};
        let labelsVisible = window.innerWidth >= 1024; // Labels only on desktop
        let searchVisible = false;
        let pathTracerVisible = false;
        
        // Path tracing
        let currentPath = [];
        let pathHighlightedNodes = [];
        let pathHighlightedConnections = [];
        
        // Mobile detection
        const isMobile = window.innerWidth < 768;
        const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;

        // ============================================
        // INITIALIZATION
        // ============================================

        async function init() {
            initTheme();
            await loadNetworkData();
            createAmbientParticles();
            if (!isMobile) {
                setupCustomCursor();
                setupMagneticButtons();
            }
            
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const bgColor = isDark ? 0x030305 : 0xf8fafc;
            
            scene = new THREE.Scene();
            scene.background = new THREE.Color(bgColor);
            scene.fog = new THREE.FogExp2(bgColor, isMobile ? 0.015 : 0.012);

            camera = new THREE.PerspectiveCamera(isMobile ? 60 : 50, window.innerWidth / window.innerHeight, 0.1, 1000);
            updateCameraPosition();

            const container = document.getElementById('canvas-container');
            renderer = new THREE.WebGLRenderer({ 
                antialias: !isMobile, // Disable antialiasing on mobile for performance
                alpha: true,
                powerPreference: isMobile ? 'low-power' : 'high-performance'
            });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 2 : 2));
            // Match color space and tone mapping to older Three.js defaults
            if (renderer.outputColorSpace !== undefined) {
                renderer.outputColorSpace = THREE.SRGBColorSpace;
            }
            if (renderer.toneMapping !== undefined) {
                renderer.toneMapping = THREE.NoToneMapping;
            }
            container.appendChild(renderer.domElement);

            raycaster = new THREE.Raycaster();
            mouse = new THREE.Vector2();

            // Lighting
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
            scene.add(ambientLight);

            const pointLight1 = new THREE.PointLight(0xffffff, 1);
            pointLight1.position.set(15, 15, 15);
            scene.add(pointLight1);

            const accentLight1 = new THREE.PointLight(isDark ? 0x00f0ff : 0x7c3aed, 4, 80);
            accentLight1.position.set(-25, 8, 20);
            scene.add(accentLight1);

            const accentLight2 = new THREE.PointLight(isDark ? 0xbf00ff : 0xec4899, 4, 80);
            accentLight2.position.set(30, -8, -20);
            scene.add(accentLight2);

            createGrid();
            buildNetwork();
            createBackgroundParticles();
            if (!isMobile) {
                createTimelineMarkers();
            }
            updateLegendColors();
            populatePathSelectors();

            // Store initial positions
            nodes.forEach(node => {
                targetPositions[node.userData.id] = {
                    network: node.position.clone(),
                    timeline: calculateTimelinePosition(node.userData)
                };
            });

            // Events
            window.addEventListener('resize', onWindowResize);
            
            // Touch events for mobile
            container.addEventListener('touchstart', onTouchStart, { passive: false });
            container.addEventListener('touchmove', onTouchMove, { passive: false });
            container.addEventListener('touchend', onTouchEnd);
            
            // Mouse events for desktop
            if (!isMobile) {
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mousedown', onMouseDown);
                document.addEventListener('mouseup', onMouseUp);
                container.addEventListener('wheel', onWheel, { passive: false });
            }
            
            document.addEventListener('click', onClick);
            document.addEventListener('keydown', onKeyDown);

            setupBottomSheet();
            setupSearch();
            handleDeepLink();

            setTimeout(() => {
                const loadingEl = document.getElementById('loading');
                loadingEl.classList.add('exiting');
                setTimeout(() => {
                    loadingEl.classList.add('hidden');
                    setTimeout(() => {
                        checkFirstVisit();
                    }, 500);
                }, 400);
            }, 1500);

            animate();
            if (!isMobile) {
                typeWriterEffect();
            }
        }

        // ============================================
        // MOBILE BOTTOM SHEET
        // ============================================

        function setupBottomSheet() {
            const sheet = document.getElementById('bottom-sheet');
            const handle = document.getElementById('sheet-handle');
            let startY, isSheetDragging = false;

            handle.addEventListener('touchstart', (e) => {
                isSheetDragging = true;
                startY = e.touches[0].clientY;
            }, { passive: true });

            document.addEventListener('touchmove', (e) => {
                if (!isSheetDragging) return;
                const deltaY = startY - e.touches[0].clientY;
                
                if (deltaY < -30) {
                    sheet.classList.remove('expanded');
                } else if (deltaY > 30) {
                    sheet.classList.add('expanded');
                }
            }, { passive: true });

            document.addEventListener('touchend', () => {
                isSheetDragging = false;
            });
        }

        function toggleBottomSheet() {
            const sheet = document.getElementById('bottom-sheet');
            sheet.classList.toggle('expanded');
        }

        // ============================================
        // ONBOARDING - MOBILE OPTIMIZED
        // ============================================

        const onboardingSteps = [
            {
                icon: 'fa-brain',
                title: 'Welcome!',
                description: 'This 3D visualization shows my journey from medical student to AI engineer. Each glowing sphere is a skill.',
                target: null,
                action: null
            },
            {
                icon: 'fa-hand-pointer',
                title: 'Explore',
                description: 'Drag to rotate, pinch to zoom, and tap any node to learn more.',
                target: '#canvas-container',
                action: null
            },
            {
                icon: 'fa-bolt',
                title: 'Forward Pass',
                description: 'Expand the panel and tap Forward Pass to see data flow through my skills!',
                target: '#bottom-sheet',
                action: () => document.getElementById('bottom-sheet').classList.add('expanded')
            },
            {
                icon: 'fa-route',
                title: 'Trace Paths',
                description: 'Use the path tracer button to see how any two skills connect.',
                target: isMobile ? '#pathFab' : '#path-toggle-btn',
                action: () => document.getElementById('bottom-sheet').classList.remove('expanded')
            },
            {
                icon: 'fa-clock-rotate-left',
                title: 'Timeline View',
                description: 'Switch to timeline view to see my journey chronologically from 2015 to 2026.',
                target: isMobile ? '#viewFab' : '#timelineViewBtn',
                action: null
            }
        ];

        let currentOnboardingStep = 0;

        function checkFirstVisit() {
            if (!localStorage.getItem('portfolio_onboarded_v4')) {
                startOnboarding();
            }
        }

        function startOnboarding() {
            currentOnboardingStep = 0;
            showOnboardingStep(currentOnboardingStep);
            document.getElementById('onboarding-overlay').classList.add('visible');
        }

        function showOnboardingStep(stepIndex) {
            const step = onboardingSteps[stepIndex];
            
            document.getElementById('onboarding-icon').innerHTML = `<i class="fa-solid ${step.icon}"></i>`;
            document.getElementById('onboarding-title').textContent = step.title;
            document.getElementById('onboarding-description').textContent = step.description;
            
            // Execute step action if present
            if (step.action) {
                step.action();
            }
            
            document.querySelectorAll('.onboarding-step').forEach((el, i) => {
                el.classList.toggle('active', i === stepIndex);
            });
            
            document.getElementById('onboarding-prev').style.display = stepIndex > 0 ? 'block' : 'none';
            document.getElementById('onboarding-next').textContent = stepIndex === onboardingSteps.length - 1 ? 'Get started!' : 'Next';
            
            const highlight = document.getElementById('onboarding-highlight');
            if (step.target && stepIndex > 0) {
                // Small delay to let any action complete
                setTimeout(() => {
                    const targetEl = document.querySelector(step.target);
                    if (targetEl) {
                        const rect = targetEl.getBoundingClientRect();
                        highlight.style.left = (rect.left - 8) + 'px';
                        highlight.style.top = (rect.top - 8) + 'px';
                        highlight.style.width = (rect.width + 16) + 'px';
                        highlight.style.height = (rect.height + 16) + 'px';
                        highlight.classList.add('visible');
                    }
                }, 100);
            } else {
                highlight.classList.remove('visible');
            }
        }

        function nextOnboardingStep() {
            if (currentOnboardingStep < onboardingSteps.length - 1) {
                currentOnboardingStep++;
                showOnboardingStep(currentOnboardingStep);
            } else {
                finishOnboarding();
            }
        }

        function prevOnboardingStep() {
            if (currentOnboardingStep > 0) {
                currentOnboardingStep--;
                showOnboardingStep(currentOnboardingStep);
            }
        }

        function skipOnboarding() {
            finishOnboarding();
        }

        function finishOnboarding() {
            document.getElementById('onboarding-overlay').classList.remove('visible');
            document.getElementById('onboarding-highlight').classList.remove('visible');
            localStorage.setItem('portfolio_onboarded_v4', 'true');
        }

        // ============================================
        // PATH TRACING
        // ============================================

        function populatePathSelectors() {
            const startSelect = document.getElementById('path-start');
            const endSelect = document.getElementById('path-end');
            
            networkData.layers.forEach(layer => {
                const optgroup = document.createElement('optgroup');
                optgroup.label = layer.label;
                
                const optgroup2 = document.createElement('optgroup');
                optgroup2.label = layer.label;
                
                layer.nodes.forEach(node => {
                    const option1 = document.createElement('option');
                    option1.value = node.id;
                    option1.textContent = node.name;
                    optgroup.appendChild(option1);
                    
                    const option2 = document.createElement('option');
                    option2.value = node.id;
                    option2.textContent = node.name;
                    optgroup2.appendChild(option2);
                });
                
                startSelect.appendChild(optgroup);
                endSelect.appendChild(optgroup2);
            });
            
            startSelect.value = 'medical';
            endSelect.value = 'healthcare_ai';
        }

        function setPresetPath(startId, endId) {
            document.getElementById('path-start').value = startId;
            document.getElementById('path-end').value = endId;
            tracePath();
        }

        function togglePathTracer() {
            const panel = document.getElementById('path-tracer');
            const fab = document.getElementById('pathFab');
            const minimizedBar = document.getElementById('path-minimized-bar');
            
            // If currently minimized, restore instead of toggling off
            if (panel.classList.contains('minimized')) {
                restorePathTracer();
                return;
            }
            
            pathTracerVisible = !pathTracerVisible;
            
            if (pathTracerVisible) {
                panel.classList.add('visible');
                panel.classList.remove('minimized');
                if (fab) fab.classList.add('active');
                if (minimizedBar) minimizedBar.style.display = 'none';
                closeSearch();
            } else {
                panel.classList.remove('visible', 'minimized');
                if (fab) fab.classList.remove('active');
                if (minimizedBar) minimizedBar.style.display = 'none';
                clearPath();
            }
        }

        function minimizePathTracer() {
            const panel = document.getElementById('path-tracer');
            const minimizedBar = document.getElementById('path-minimized-bar');
            const fab = document.getElementById('pathFab');
            
            if (currentPath.length === 0) {
                // No active path — just close
                togglePathTracer();
                return;
            }
            
            panel.classList.add('minimized');
            
            // Make the minimized header bar clickable to restore
            const header = panel.querySelector('.path-tracer-header');
            if (header) {
                header.style.cursor = 'pointer';
                header.onclick = function(e) {
                    // Don't trigger if clicking the action buttons
                    if (e.target.closest('.path-tracer-minimize') || e.target.closest('.path-tracer-close')) return;
                    restorePathTracer();
                };
            }
            
            // Show floating indicator on desktop; on mobile the bar itself is the indicator
            if (minimizedBar) {
                const label = document.getElementById('path-minimized-label');
                if (label) label.textContent = `Path: ${currentPath.length} nodes`;
                minimizedBar.style.display = window.innerWidth >= 768 ? 'flex' : 'none';
            }
            // Keep FAB active since path is still active
        }

        function restorePathTracer() {
            const panel = document.getElementById('path-tracer');
            const minimizedBar = document.getElementById('path-minimized-bar');
            
            panel.classList.remove('minimized');
            panel.classList.add('visible');
            pathTracerVisible = true;
            if (minimizedBar) minimizedBar.style.display = 'none';
            
            // Remove the click-to-restore handler
            const header = panel.querySelector('.path-tracer-header');
            if (header) {
                header.style.cursor = '';
                header.onclick = null;
            }
        }

        function findPath(startId, endId) {
            const graph = {};
            networkData.layers.forEach(layer => {
                layer.nodes.forEach(node => {
                    graph[node.id] = [];
                });
            });
            
            networkData.connections.forEach(conn => {
                graph[conn.from].push(conn.to);
                graph[conn.to].push(conn.from);
            });
            
            const queue = [[startId]];
            const visited = new Set([startId]);
            
            while (queue.length > 0) {
                const path = queue.shift();
                const current = path[path.length - 1];
                
                if (current === endId) return path;
                
                for (const neighbor of graph[current] || []) {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        queue.push([...path, neighbor]);
                    }
                }
            }
            
            return null;
        }

        function tracePath() {
            const startId = document.getElementById('path-start').value;
            const endId = document.getElementById('path-end').value;
            
            if (startId === endId) {
                document.getElementById('path-result').style.display = 'block';
                const pathNodes = document.getElementById('path-nodes');
                pathNodes.textContent = '';
                const span = document.createElement('span');
                span.style.color = 'var(--text-muted)';
                span.textContent = 'Same node selected';
                pathNodes.appendChild(span);
                return;
            }
            
            clearPath();
            
            const path = findPath(startId, endId);
            
            if (!path) {
                document.getElementById('path-result').style.display = 'block';
                const pathNodes = document.getElementById('path-nodes');
                pathNodes.textContent = '';
                const span = document.createElement('span');
                span.style.color = 'var(--text-muted)';
                span.textContent = 'No path found';
                pathNodes.appendChild(span);
                return;
            }
            
            currentPath = path;
            
            document.getElementById('path-result').style.display = 'block';
            const pathNodesContainer = document.getElementById('path-nodes');
            pathNodesContainer.textContent = '';
            path.forEach((nodeId, i) => {
                const node = nodes.find(n => n.userData.id === nodeId);
                const name = node ? node.userData.name : nodeId;
                
                const chip = document.createElement('span');
                chip.className = 'path-node-chip';
                chip.textContent = name;
                chip.addEventListener('click', () => selectNodeById(nodeId));
                pathNodesContainer.appendChild(chip);
                
                if (i < path.length - 1) {
                    const arrow = document.createElement('i');
                    arrow.className = 'fa-solid fa-arrow-right path-arrow-small';
                    pathNodesContainer.appendChild(arrow);
                }
            });
            
            highlightPath(path);
        }

        function highlightPath(path) {
            nodes.forEach(node => {
                if (!path.includes(node.userData.id)) {
                    node.material.opacity = 0.15;
                    node.material.emissiveIntensity = 0.1;
                    node.userData.dimmed = true;
                }
            });
            
            connections.forEach(conn => {
                conn.mesh.material.opacity = 0.03;
            });
            
            path.forEach((nodeId, i) => {
                setTimeout(() => {
                    const node = nodes.find(n => n.userData.id === nodeId);
                    if (node) {
                        pathHighlightedNodes.push(node);
                        node.material.opacity = 1;
                        node.material.emissiveIntensity = 1.5;
                        node.scale.set(1.4, 1.4, 1.4);
                        node.userData.dimmed = false;
                        
                        if (i < path.length - 1) {
                            const nextId = path[i + 1];
                            const conn = connections.find(c => 
                                (c.source.userData.id === nodeId && c.target.userData.id === nextId) ||
                                (c.target.userData.id === nodeId && c.source.userData.id === nextId)
                            );
                            if (conn) {
                                pathHighlightedConnections.push(conn);
                                conn.mesh.material.opacity = 0.9;
                                createDataPacket(conn);
                            }
                        }
                        
                        if (i === Math.floor(path.length / 2)) {
                            targetCameraTarget.copy(node.position);
                            targetCameraDistance = 25;
                        }
                    }
                }, i * 400);
            });
        }

        function clearPath() {
            currentPath = [];
            
            nodes.forEach(node => {
                node.material.opacity = 0.95;
                node.material.emissiveIntensity = 0.4;
                node.scale.set(1, 1, 1);
                node.userData.dimmed = false;
            });
            
            connections.forEach(conn => {
                conn.mesh.material.opacity = conn.baseOpacity;
            });
            
            pathHighlightedNodes = [];
            pathHighlightedConnections = [];
            
            document.getElementById('path-result').style.display = 'none';
        }

        // ============================================
        // TIMELINE
        // ============================================

        function createTimelineMarkers() {
            const years = [2015, 2019, 2021, 2023, 2025, 2026];
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            
            years.forEach(year => {
                const x = (year - 2020) * 8;
                
                const lineGeometry = new THREE.BufferGeometry();
                const linePoints = [
                    new THREE.Vector3(x, -15, 0),
                    new THREE.Vector3(x, 15, 0)
                ];
                lineGeometry.setFromPoints(linePoints);
                
                const lineMaterial = new THREE.LineBasicMaterial({
                    color: isDark ? 0x00f0ff : 0x7c3aed,
                    transparent: true,
                    opacity: 0
                });
                
                const line = new THREE.Line(lineGeometry, lineMaterial);
                line.userData.year = year;
                scene.add(line);
                timelineLines.push(line);
                
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 256;
                canvas.height = 128;
                
                ctx.fillStyle = isDark ? 'rgba(0, 240, 255, 0.9)' : 'rgba(124, 58, 237, 0.9)';
                ctx.font = 'bold 64px JetBrains Mono, monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(year.toString(), canvas.width / 2, canvas.height / 2);
                
                const texture = new THREE.CanvasTexture(canvas);
                texture.minFilter = THREE.LinearFilter;
                
                const spriteMaterial = new THREE.SpriteMaterial({
                    map: texture,
                    transparent: true,
                    opacity: 0
                });
                
                const sprite = new THREE.Sprite(spriteMaterial);
                sprite.scale.set(8, 4, 1);
                sprite.position.set(x, -12, 0);
                sprite.userData.year = year;
                sprite.isSprite = true;
                scene.add(sprite);
                timelineMarkers.push(sprite);
            });
        }

        function updateTimelineVisibility() {
            const isTimeline = currentView === 'timeline';
            const targetOpacity = isTimeline ? 0.6 : 0;
            
            timelineLines.forEach(line => {
                line.material.opacity += (targetOpacity - line.material.opacity) * 0.1;
            });
            
            timelineMarkers.forEach(marker => {
                if (marker.material) {
                    const markerTargetOpacity = isTimeline ? (marker.isSprite ? 0.9 : 0.3) : 0;
                    marker.material.opacity += (markerTargetOpacity - marker.material.opacity) * 0.1;
                }
            });
        }

        function calculateTimelinePosition(nodeData) {
            const year = nodeData.year || 2025;
            const yearOffset = (year - 2020) * 8;
            
            const nodesInYear = [];
            networkData.layers.forEach(layer => {
                layer.nodes.forEach(n => {
                    if ((n.year || 2025) === year) {
                        nodesInYear.push(n.id);
                    }
                });
            });
            
            const indexInYear = nodesInYear.indexOf(nodeData.id);
            const totalInYear = nodesInYear.length;
            const yOffset = ((totalInYear - 1) / 2 - indexInYear) * 3;
            
            const hashCode = nodeData.id.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0);
            const zOffset = (Math.abs(hashCode) % 10 - 5) * 0.5;
            
            return new THREE.Vector3(yearOffset, yOffset, zOffset);
        }

        // ============================================
        // DEEP LINKING
        // ============================================

        function handleDeepLink() {
            const params = new URLSearchParams(window.location.search);
            const nodeId = params.get('node');
            
            if (nodeId) {
                setTimeout(() => {
                    const node = nodes.find(n => n.userData.id === nodeId);
                    if (node) {
                        selectedNode = node;
                        openPanel(node.userData);
                        focusOnNode(node);
                    }
                }, 1600);
            }
        }

        function updateURL(nodeId) {
            const url = new URL(window.location);
            if (nodeId) {
                url.searchParams.set('node', nodeId);
            } else {
                url.searchParams.delete('node');
            }
            history.replaceState(null, '', url);
        }

        function copyShareLink() {
            const url = window.location.href;
            navigator.clipboard.writeText(url).then(() => {
                const btn = document.querySelector('.share-link-btn');
                btn.classList.add('copied');
                btn.textContent = '';
                const check = document.createElement('i');
                check.className = 'fa-solid fa-check';
                btn.appendChild(check);
                btn.appendChild(document.createTextNode(' Copied!'));
                setTimeout(() => {
                    btn.classList.remove('copied');
                    btn.textContent = '';
                    const share = document.createElement('i');
                    share.className = 'fa-solid fa-share-nodes';
                    btn.appendChild(share);
                    btn.appendChild(document.createTextNode(' Copy Share Link'));
                }, 2000);
            });
        }

        // ============================================
        // SEARCH
        // ============================================

        function setupSearch() {
            const searchInputs = [
                document.getElementById('node-search'),
                document.getElementById('node-search-desktop')
            ];
            const searchResults = document.getElementById('search-results');
            
            searchInputs.forEach(input => {
                if (!input) return;
                input.addEventListener('input', (e) => {
                    const query = e.target.value.toLowerCase().trim();
                    
                    // Sync both inputs
                    searchInputs.forEach(i => { if (i && i !== e.target) i.value = e.target.value; });
                    
                    if (query === '') {
                        searchResults.innerHTML = '';
                        resetNodeVisibility();
                        return;
                    }

                    const matches = [];
                    networkData.layers.forEach(layer => {
                        layer.nodes.forEach(nodeData => {
                            const nameMatch = nodeData.name.toLowerCase().includes(query);
                            const tagMatch = nodeData.tags.some(t => t.toLowerCase().includes(query));
                            const descMatch = nodeData.description.toLowerCase().includes(query);
                            
                            if (nameMatch || tagMatch || descMatch) {
                                matches.push({
                                    ...nodeData,
                                    layerLabel: layer.label,
                                    colorVar: layer.colorVar
                                });
                            }
                        });
                    });

                    if (matches.length === 0) {
                        searchResults.textContent = '';
                        const empty = document.createElement('div');
                        empty.style.cssText = 'text-align: center; padding: 1rem; color: var(--text-muted)';
                        empty.textContent = 'No results found';
                        searchResults.appendChild(empty);
                    } else {
                        searchResults.textContent = '';
                        matches.forEach(m => {
                            const colorHex = getComputedStyle(document.documentElement).getPropertyValue(m.colorVar).trim();
                            const item = document.createElement('div');
                            item.className = 'search-result-item';
                            item.addEventListener('click', () => selectNodeById(m.id));

                            const iconWrap = document.createElement('div');
                            iconWrap.className = 'search-result-icon';
                            iconWrap.style.background = colorHex;
                            const icon = document.createElement('i');
                            icon.className = 'fa-solid ' + m.icon.replace(/[^a-z0-9 -]/gi, '');
                            iconWrap.appendChild(icon);

                            const info = document.createElement('div');
                            info.className = 'search-result-info';
                            const name = document.createElement('div');
                            name.className = 'search-result-name';
                            name.textContent = m.name;
                            const layer = document.createElement('div');
                            layer.className = 'search-result-layer';
                            layer.textContent = m.layerLabel;
                            info.appendChild(name);
                            info.appendChild(layer);

                            item.appendChild(iconWrap);
                            item.appendChild(info);
                            searchResults.appendChild(item);
                        });
                    }

                    // Dim non-matching nodes
                    const matchIds = matches.map(m => m.id);
                    nodes.forEach(node => {
                        if (matchIds.includes(node.userData.id)) {
                            node.material.opacity = 0.95;
                            node.material.emissiveIntensity = 0.8;
                            node.userData.dimmed = false;
                        } else {
                            node.material.opacity = 0.15;
                            node.material.emissiveIntensity = 0.1;
                            node.userData.dimmed = true;
                        }
                    });

                    connections.forEach(conn => {
                        const sourceMatch = matchIds.includes(conn.source.userData.id);
                        const targetMatch = matchIds.includes(conn.target.userData.id);
                        conn.mesh.material.opacity = (sourceMatch && targetMatch) ? conn.baseOpacity : 0.02;
                    });
                });
            });
        }

        function resetNodeVisibility() {
            nodes.forEach(node => {
                node.material.opacity = 0.95;
                node.material.emissiveIntensity = 0.4;
                node.userData.dimmed = false;
            });
            connections.forEach(conn => {
                conn.mesh.material.opacity = conn.baseOpacity;
            });
        }

        function selectNodeById(nodeId) {
            const node = nodes.find(n => n.userData.id === nodeId);
            if (node) {
                selectedNode = node;
                openPanel(node.userData);
                focusOnNode(node);
                closeSearch();
                
                document.getElementById('node-search').value = '';
                const desktopInput = document.getElementById('node-search-desktop');
                if (desktopInput) desktopInput.value = '';
                document.getElementById('search-results').innerHTML = '';
                resetNodeVisibility();
            }
        }

        function focusOnNode(node) {
            targetCameraTarget.copy(node.position);
            targetCameraDistance = isMobile ? 18 : 15;
            updateURL(node.userData.id);
        }

        function toggleSearch() {
            searchVisible = !searchVisible;
            const overlay = document.getElementById('search-overlay');
            const btn = document.getElementById('search-toggle-btn');
            
            if (searchVisible) {
                overlay.classList.add('visible');
                btn.classList.add('active');
                
                // Show appropriate input
                if (window.innerWidth >= 1024) {
                    document.getElementById('desktop-search-input').style.display = 'block';
                    document.querySelector('.search-header').style.display = 'none';
                    document.getElementById('node-search-desktop').focus();
                } else {
                    document.getElementById('desktop-search-input').style.display = 'none';
                    document.querySelector('.search-header').style.display = 'flex';
                    document.getElementById('node-search').focus();
                }
                
                if (pathTracerVisible || document.getElementById('path-tracer').classList.contains('minimized')) {
                    // Close path tracer completely when opening search
                    const ptPanel = document.getElementById('path-tracer');
                    ptPanel.classList.remove('visible', 'minimized');
                    document.getElementById('path-minimized-bar').style.display = 'none';
                    const ptFab = document.getElementById('pathFab');
                    if (ptFab) ptFab.classList.remove('active');
                    pathTracerVisible = false;
                    clearPath();
                }
            } else {
                closeSearch();
            }
        }

        function closeSearch() {
            searchVisible = false;
            document.getElementById('search-overlay').classList.remove('visible');
            document.getElementById('search-toggle-btn').classList.remove('active');
            document.getElementById('node-search').value = '';
            const desktopInput = document.getElementById('node-search-desktop');
            if (desktopInput) desktopInput.value = '';
            document.getElementById('search-results').innerHTML = '';
            resetNodeVisibility();
        }

        // ============================================
        // NODE LABELS (Desktop only)
        // ============================================

        function createNodeLabel(node) {
            if (isMobile) return; // Skip labels on mobile
            
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 512;
            canvas.height = 128;
            
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            ctx.fillStyle = isDark ? 'rgba(10, 10, 20, 0.8)' : 'rgba(255, 255, 255, 0.9)';
            ctx.beginPath();
            ctx.roundRect(0, 30, canvas.width, 68, 20);
            ctx.fill();
            
            ctx.strokeStyle = isDark ? 'rgba(0, 240, 255, 0.3)' : 'rgba(124, 58, 237, 0.3)';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.fillStyle = isDark ? '#fafafa' : '#18181b';
            ctx.font = 'bold 32px JetBrains Mono, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            let name = node.userData.name;
            if (name.length > 18) name = name.substring(0, 16) + '...';
            ctx.fillText(name, canvas.width / 2, 64);
            
            const texture = new THREE.CanvasTexture(canvas);
            texture.minFilter = THREE.LinearFilter;
            
            const spriteMaterial = new THREE.SpriteMaterial({ 
                map: texture, 
                transparent: true,
                opacity: 0.9,
                depthTest: false
            });
            
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.scale.set(5, 1.25, 1);
            sprite.position.y = 1.5;
            sprite.userData.isLabel = true;
            
            node.add(sprite);
            nodeLabels.push(sprite);
        }

        function updateNodeLabels() {
            if (isMobile) return;
            
            nodeLabels.forEach(label => {
                label.lookAt(camera.position);
                
                const parent = label.parent;
                if (parent) {
                    const distance = camera.position.distanceTo(parent.position);
                    const scale = Math.max(0.5, Math.min(1.2, 30 / distance));
                    label.scale.set(5 * scale, 1.25 * scale, 1);
                    label.material.opacity = labelsVisible ? Math.max(0.3, Math.min(0.9, 50 / distance)) : 0;
                }
            });
        }

        function toggleLabels() {
            labelsVisible = !labelsVisible;
        }

        // ============================================
        // THREE.JS SCENE BUILDING
        // ============================================

        function createGrid() {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const gridColor = isDark ? 0x00f0ff : 0x7c3aed;
            
            const gridHelper = new THREE.GridHelper(100, isMobile ? 25 : 50, gridColor, gridColor);
            gridHelper.material.opacity = 0.08;
            gridHelper.material.transparent = true;
            gridHelper.position.y = -12;
            scene.add(gridHelper);
            gridLines = gridHelper;
        }

        function buildNetwork() {
            const layerCount = networkData.layers.length;
            const startX = -((layerCount - 1) * config.layerGap) / 2;

            networkData.layers.forEach((layer, layerIdx) => {
                const x = startX + layerIdx * config.layerGap;
                const nodeCount = layer.nodes.length;
                const startY = ((nodeCount - 1) * config.nodeSpacing) / 2;

                const colorHex = getComputedStyle(document.documentElement).getPropertyValue(layer.colorVar).trim();
                const color = new THREE.Color(colorHex);

                layer.nodes.forEach((nodeData, nodeIdx) => {
                    const y = startY - nodeIdx * config.nodeSpacing;
                    const z = (Math.random() - 0.5) * 2;
                    createNode(new THREE.Vector3(x, y, z), color, nodeData, layer.id, layer.label);
                });
            });

            networkData.connections.forEach(connData => {
                const sourceNode = nodes.find(n => n.userData.id === connData.from);
                const targetNode = nodes.find(n => n.userData.id === connData.to);
                if (sourceNode && targetNode) createConnection(sourceNode, targetNode, connData.strength);
            });
        }

        function createNode(position, color, data, layerId, layerLabel) {
            const geometry = new THREE.IcosahedronGeometry(config.nodeSize, isMobile ? 1 : 2);
            const material = new THREE.MeshStandardMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 0.4,
                metalness: 0.3,
                roughness: 0.4,
                transparent: true,
                opacity: 0.95
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.copy(position);
            mesh.userData = { ...data, layerId, layerLabel, color: color.clone(), basePosition: position.clone() };

            scene.add(mesh);
            nodes.push(mesh);

            // Outer glow
            const glowGeometry = new THREE.IcosahedronGeometry(config.nodeSize * 1.4, 1);
            const glowMaterial = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.15,
                side: THREE.BackSide
            });
            const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
            mesh.add(glowMesh);

            if (!isMobile) {
                createOrbitalRing(mesh, color);
                createNodeLabel(mesh);
            }
        }

        function createOrbitalRing(parentNode, color) {
            const ringGeometry = new THREE.TorusGeometry(0.85, 0.02, 8, 64);
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: color,
                transparent: true,
                opacity: 0.5
            });

            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            ring.rotation.x = Math.PI / 2;
            ring.userData.parentNode = parentNode;
            ring.userData.rotationSpeed = 0.02 + Math.random() * 0.02;
            parentNode.add(ring);
            orbitalRings.push(ring);

            const ring2 = new THREE.Mesh(ringGeometry.clone(), ringMaterial.clone());
            ring2.rotation.x = Math.PI / 3;
            ring2.rotation.z = Math.PI / 4;
            ring2.userData.parentNode = parentNode;
            ring2.userData.rotationSpeed = 0.015 + Math.random() * 0.015;
            parentNode.add(ring2);
            orbitalRings.push(ring2);
        }

        function createConnection(nodeA, nodeB, strength) {
            const points = [];
            const segments = isMobile ? 15 : 30;
            
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const x = nodeA.position.x + (nodeB.position.x - nodeA.position.x) * t;
                const y = nodeA.position.y + (nodeB.position.y - nodeA.position.y) * t + Math.sin(t * Math.PI) * 2;
                const z = nodeA.position.z + (nodeB.position.z - nodeA.position.z) * t;
                points.push(new THREE.Vector3(x, y, z));
            }

            const curve = new THREE.CatmullRomCurve3(points);
            const tubeGeometry = new THREE.TubeGeometry(curve, segments, 0.025 + strength * 0.02, isMobile ? 4 : 8, false);

            const colors = [];
            const colorA = nodeA.userData.color;
            const colorB = nodeB.userData.color;
            const positions = tubeGeometry.attributes.position;
            
            for (let i = 0; i < positions.count; i++) {
                const t = i / positions.count;
                const mixedColor = colorA.clone().lerp(colorB, t);
                colors.push(mixedColor.r, mixedColor.g, mixedColor.b);
            }
            
            tubeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

            const material = new THREE.MeshBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: strength * 0.4 + 0.1
            });

            const tube = new THREE.Mesh(tubeGeometry, material);
            scene.add(tube);

            connections.push({
                mesh: tube,
                source: nodeA,
                target: nodeB,
                strength,
                curve,
                baseOpacity: strength * 0.4 + 0.1
            });
        }

        function createBackgroundParticles() {
            const geometry = new THREE.BufferGeometry();
            const positions = [], colors = [];

            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const baseColor = isDark ? new THREE.Color(0x00f0ff) : new THREE.Color(0x7c3aed);

            for (let i = 0; i < config.particleCount; i++) {
                positions.push(
                    (Math.random() - 0.5) * 180,
                    (Math.random() - 0.5) * 120,
                    (Math.random() - 0.5) * 120 - 30
                );

                const mixRatio = Math.random();
                colors.push(
                    baseColor.r * (0.2 + mixRatio * 0.5),
                    baseColor.g * (0.2 + mixRatio * 0.5),
                    baseColor.b * (0.2 + mixRatio * 0.5)
                );
            }

            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

            const material = new THREE.PointsMaterial({
                size: isMobile ? 0.15 : 0.12,
                transparent: true,
                opacity: 0.7,
                vertexColors: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            particlesSystem = new THREE.Points(geometry, material);
            scene.add(particlesSystem);
        }

        // ============================================
        // ANIMATION LOOP
        // ============================================

        function animate() {
            requestAnimationFrame(animate);
            time += 0.01;

            // Smooth camera transitions
            cameraAngleX += (targetCameraAngleX - cameraAngleX) * 0.05;
            cameraAngleY += (targetCameraAngleY - cameraAngleY) * 0.05;
            cameraDistance += (targetCameraDistance - cameraDistance) * 0.05;
            cameraTarget.lerp(targetCameraTarget, 0.05);

            if (autoRotate && !isDragging) {
                targetCameraAngleX += 0.002;
            }

            updateCameraPosition();
            
            if (!isMobile) {
                updateTimelineVisibility();
            }

            // Animate particles (reduced frequency on mobile)
            if (particlesSystem && (!isMobile || Math.random() > 0.5)) {
                const positions = particlesSystem.geometry.attributes.position.array;
                for (let i = 0; i < positions.length; i += 3) {
                    positions[i + 1] += Math.sin(time + positions[i] * 0.01) * 0.003;
                }
                particlesSystem.geometry.attributes.position.needsUpdate = true;
                particlesSystem.rotation.y = time * 0.015;
            }

            // Update nodes
            nodes.forEach((node, i) => {
                if (node.userData.dimmed) return;
                
                const isActive = hoveredNode === node || selectedNode === node;
                const isConnected = isConnectedTo(node, hoveredNode) || isConnectedTo(node, selectedNode);
                const isInPath = currentPath.includes(node.userData.id);

                let targetIntensity = isActive ? 1.2 : (isConnected ? 0.7 : 0.4);
                if (isInPath && currentPath.length > 0) targetIntensity = 1.2;
                node.material.emissiveIntensity += (targetIntensity - node.material.emissiveIntensity) * 0.1;

                let targetScale = isActive ? 1.3 : 1;
                if (isInPath && currentPath.length > 0) targetScale = 1.3;
                node.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);

                if (isActive) {
                    node.rotation.y += 0.03;
                    node.rotation.z += 0.015;
                }

                const baseY = currentView === 'network' 
                    ? node.userData.basePosition.y 
                    : (targetPositions[node.userData.id]?.timeline.y || 0);
                const floatY = baseY + Math.sin(time * 1.5 + i * 0.5) * 0.1;
                node.position.y += (floatY - node.position.y) * 0.05;

                if (targetPositions[node.userData.id]) {
                    const target = targetPositions[node.userData.id][currentView];
                    node.position.x += (target.x - node.position.x) * 0.05;
                    node.position.z += (target.z - node.position.z) * 0.05;
                }

                // Glow animation
                if (node.children[0] && !node.children[0].userData?.isLabel) {
                    const glowScale = 1 + Math.sin(time * 2 + i) * 0.1 + (isActive ? 0.3 : 0);
                    node.children[0].scale.setScalar(glowScale);
                }
            });

            // Update orbital rings (desktop only)
            if (!isMobile) {
                orbitalRings.forEach(ring => {
                    ring.rotation.z += ring.userData.rotationSpeed || 0.02;
                    const parentNode = ring.userData.parentNode;
                    if (parentNode) {
                        const isActive = hoveredNode === parentNode || selectedNode === parentNode;
                        ring.material.opacity = isActive ? 0.8 : 0.3;
                    }
                });
            }

            // Connection highlighting
            connections.forEach(conn => {
                if (conn.source.userData.dimmed || conn.target.userData.dimmed) return;
                if (currentPath.length > 0) return;
                
                const isActive = hoveredNode === conn.source || hoveredNode === conn.target ||
                                 selectedNode === conn.source || selectedNode === conn.target;
                
                let targetOpacity;
                if (currentView === 'timeline') {
                    targetOpacity = isActive ? 0.3 : 0.05;
                } else {
                    targetOpacity = isActive ? conn.strength * 0.8 + 0.2 : conn.baseOpacity;
                }
                conn.mesh.material.opacity += (targetOpacity - conn.mesh.material.opacity) * 0.1;
            });

            // Data packets (reduced on mobile)
            if (Math.random() > (isMobile ? 0.99 : 0.97) && currentPath.length === 0) {
                const randomConn = connections[Math.floor(Math.random() * connections.length)];
                if (randomConn && randomConn.strength > 0.5) createDataPacket(randomConn);
            }

            updateDataPackets();
            
            if (!isMobile) {
                updateNodeLabels();
            }
            
            renderer.render(scene, camera);
        }

        function createDataPacket(connection) {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const packetColor = isDark ? 0x00ffff : 0xfbbf24;
            
            const geometry = new THREE.SphereGeometry(0.15, isMobile ? 6 : 12, isMobile ? 6 : 12);
            const material = new THREE.MeshBasicMaterial({ color: packetColor, transparent: true, opacity: 1 });
            const packet = new THREE.Mesh(geometry, material);
            
            if (!isMobile) {
                const glowGeometry = new THREE.SphereGeometry(0.35, 8, 8);
                const glowMaterial = new THREE.MeshBasicMaterial({ color: packetColor, transparent: true, opacity: 0.5 });
                const glow = new THREE.Mesh(glowGeometry, glowMaterial);
                packet.add(glow);
            }
            
            scene.add(packet);

            dataPackets.push({
                mesh: packet,
                connection: connection,
                progress: 0,
                speed: config.dataPacketSpeed + Math.random() * 0.01,
                trail: []
            });
        }

        function updateDataPackets() {
            for (let i = dataPackets.length - 1; i >= 0; i--) {
                const packet = dataPackets[i];
                packet.progress += packet.speed;

                if (packet.progress >= 1) {
                    scene.remove(packet.mesh);
                    packet.trail.forEach(t => scene.remove(t));
                    dataPackets.splice(i, 1);
                } else {
                    const source = packet.connection.source.position;
                    const target = packet.connection.target.position;
                    const t = packet.progress;
                    
                    const x = source.x + (target.x - source.x) * t;
                    const y = source.y + (target.y - source.y) * t + Math.sin(t * Math.PI) * 2;
                    const z = source.z + (target.z - source.z) * t;
                    
                    packet.mesh.position.set(x, y, z);
                    
                    const fadeOpacity = Math.sin(packet.progress * Math.PI);
                    packet.mesh.material.opacity = fadeOpacity;
                    
                    if (packet.mesh.children[0]) {
                        packet.mesh.children[0].material.opacity = fadeOpacity * 0.5;
                        const pulseScale = 1 + Math.sin(packet.progress * Math.PI * 6) * 0.3;
                        packet.mesh.children[0].scale.setScalar(pulseScale);
                    }
                }
            }
        }

        function isConnectedTo(node, targetNode) {
            if (!targetNode) return false;
            return connections.some(c =>
                (c.source === targetNode && c.target === node) ||
                (c.target === targetNode && c.source === node)
            );
        }

        function updateCameraPosition() {
            camera.position.x = cameraTarget.x + Math.sin(cameraAngleX) * Math.cos(cameraAngleY) * cameraDistance;
            camera.position.y = cameraTarget.y + Math.sin(cameraAngleY) * cameraDistance;
            camera.position.z = cameraTarget.z + Math.cos(cameraAngleX) * Math.cos(cameraAngleY) * cameraDistance;
            camera.lookAt(cameraTarget);
        }

        // ============================================
        // VIEW MODES
        // ============================================

        function setView(viewName) {
            currentView = viewName;
            
            const networkBtn = document.getElementById('networkViewBtn');
            const timelineBtn = document.getElementById('timelineViewBtn');
            const timelineBar = document.getElementById('timeline-bar');
            const legend = document.getElementById('legend');
            
            if (networkBtn) networkBtn.classList.toggle('active', viewName === 'network');
            if (timelineBtn) timelineBtn.classList.toggle('active', viewName === 'timeline');
            if (timelineBar) timelineBar.classList.toggle('visible', viewName === 'timeline');
            if (legend) legend.style.display = viewName === 'network' ? 'block' : 'none';

            // Update FAB icon on mobile
            const viewFabIcon = document.getElementById('viewFabIcon');
            if (viewFabIcon) {
                viewFabIcon.className = viewName === 'network' ? 'fa-solid fa-clock-rotate-left' : 'fa-solid fa-diagram-project';
            }

            if (viewName === 'timeline') {
                targetCameraTarget.set(24, 0, 0);
                targetCameraDistance = isMobile ? 60 : 55;
                targetCameraAngleY = 0.1;
            } else {
                targetCameraTarget.set(0, 0, 0);
                targetCameraDistance = isMobile ? 42 : 38;
                targetCameraAngleY = 0.2;
            }
        }

        function toggleViewMode() {
            setView(currentView === 'network' ? 'timeline' : 'network');
        }

        function focusYear(year) {
            document.querySelectorAll('.timeline-year').forEach(el => {
                el.classList.toggle('active', parseInt(el.dataset.year) === year);
            });
            
            const yearOffset = (year - 2020) * 8;
            targetCameraTarget.x = yearOffset;
            targetCameraDistance = isMobile ? 30 : 25;
        }

        // ============================================
        // INPUT HANDLERS
        // ============================================

        function onMouseMove(event) {
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

            if (isDragging) {
                const deltaX = event.clientX - previousMousePosition.x;
                const deltaY = event.clientY - previousMousePosition.y;

                targetCameraAngleX -= deltaX * 0.005;
                targetCameraAngleY += deltaY * 0.005;
                targetCameraAngleY = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, targetCameraAngleY));

                previousMousePosition = { x: event.clientX, y: event.clientY };
                return;
            }

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(nodes);

            if (intersects.length > 0) {
                const node = intersects[0].object;
                if (hoveredNode !== node) {
                    hoveredNode = node;
                    document.body.style.cursor = 'pointer';
                    showTooltip(event, node.userData);
                }
                moveTooltip(event);
            } else {
                if (hoveredNode) {
                    hoveredNode = null;
                    document.body.style.cursor = isDragging ? 'grabbing' : 'grab';
                    hideTooltip();
                }
            }
        }

        function onMouseDown(event) {
            isDragging = true;
            previousMousePosition = { x: event.clientX, y: event.clientY };
            document.body.style.cursor = 'grabbing';
        }

        function onMouseUp() {
            isDragging = false;
            document.body.style.cursor = hoveredNode ? 'pointer' : 'grab';
        }

        function onClick(event) {
            // Don't process clicks on UI elements (buttons, panels, overlays)
            if (event.target.closest('.interactive') || 
                event.target.closest('#info-panel') ||
                event.target.closest('#bottom-sheet') ||
                event.target.closest('#search-overlay') ||
                event.target.closest('#path-tracer') ||
                event.target.closest('#onboarding-overlay')) {
                return;
            }
            
            // If panel is open and user clicks the canvas backdrop (not a node), close the panel
            const panelOpen = document.getElementById('info-panel').classList.contains('open');
            if (panelOpen && !hoveredNode) {
                closePanel();
                return;
            }
            
            if (hoveredNode && !isDragging) {
                selectedNode = hoveredNode;
                openPanel(hoveredNode.userData);
                focusOnNode(hoveredNode);
            }
        }

        function onWheel(event) {
            event.preventDefault();
            targetCameraDistance += event.deltaY * 0.03;
            targetCameraDistance = Math.max(10, Math.min(70, targetCameraDistance));
        }

        // Touch handlers
        let touchStartPos = { x: 0, y: 0 }, lastTouchDistance = 0, isTouchDragging = false;
        let touchStartTime = 0;

        function onTouchStart(event) {
            if (event.touches.length === 1) {
                touchStartPos = { x: event.touches[0].clientX, y: event.touches[0].clientY };
                previousMousePosition = { ...touchStartPos };
                isTouchDragging = false;
                touchStartTime = Date.now();
            } else if (event.touches.length === 2) {
                lastTouchDistance = getTouchDistance(event.touches);
            }
        }

        function onTouchMove(event) {
            event.preventDefault();
            if (event.touches.length === 1) {
                const dx = event.touches[0].clientX - previousMousePosition.x;
                const dy = event.touches[0].clientY - previousMousePosition.y;
                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    isTouchDragging = true;
                    targetCameraAngleX -= dx * 0.008;
                    targetCameraAngleY += dy * 0.008;
                    targetCameraAngleY = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, targetCameraAngleY));
                    previousMousePosition = { x: event.touches[0].clientX, y: event.touches[0].clientY };
                }
            } else if (event.touches.length === 2) {
                const currentDistance = getTouchDistance(event.touches);
                const delta = lastTouchDistance - currentDistance;
                targetCameraDistance += delta * 0.05;
                targetCameraDistance = Math.max(10, Math.min(70, targetCameraDistance));
                lastTouchDistance = currentDistance;
            }
        }

        function onTouchEnd(event) {
            const touchDuration = Date.now() - touchStartTime;
            
            if (!isTouchDragging && touchDuration < 300 && event.changedTouches.length === 1) {
                const touch = event.changedTouches[0];
                mouse.x = (touch.clientX / window.innerWidth) * 2 - 1;
                mouse.y = -(touch.clientY / window.innerHeight) * 2 + 1;
                raycaster.setFromCamera(mouse, camera);
                const intersects = raycaster.intersectObjects(nodes);
                if (intersects.length > 0) {
                    selectedNode = intersects[0].object;
                    openPanel(selectedNode.userData);
                    focusOnNode(selectedNode);
                }
            }
            isTouchDragging = false;
        }

        function getTouchDistance(touches) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            return Math.sqrt(dx * dx + dy * dy);
        }

        function onKeyDown(event) {
            // Don't trigger when typing
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') {
                if (event.key === 'Escape') {
                    closeSearch();
                }
                return;
            }
            
            switch (event.key.toLowerCase()) {
                case 'f': triggerPulse(); break;
                case 'a': highlightActivations(); break;
                case 'r': resetCamera(); break;
                case 'd': toggleTheme(); break;
                case 't': toggleViewMode(); break;
                case 'l': if (!isMobile) toggleLabels(); break;
                case 'p': togglePathTracer(); break;
                case '/': 
                    event.preventDefault();
                    toggleSearch(); 
                    break;
                case 'escape': 
                    if (searchVisible) {
                        closeSearch();
                    } else if (pathTracerVisible || document.getElementById('path-tracer').classList.contains('minimized')) {
                        // Close and clear path tracer, even if minimized
                        const ptPanel = document.getElementById('path-tracer');
                        ptPanel.classList.remove('visible', 'minimized');
                        document.getElementById('path-minimized-bar').style.display = 'none';
                        const ptFab = document.getElementById('pathFab');
                        if (ptFab) ptFab.classList.remove('active');
                        pathTracerVisible = false;
                        clearPath();
                    } else {
                        closePanel(); 
                    }
                    break;
            }
        }

        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        // ============================================
        // UI FUNCTIONS
        // ============================================

        function showTooltip(e, data) {
            const tooltip = document.getElementById('tooltip');
            if (!tooltip || isMobile) return;
            document.getElementById('tooltip-name').textContent = data.name || 'Unknown';
            document.getElementById('tooltip-tag').textContent = data.tags && data.tags.length > 0 ? `| ${data.tags[0]}` : '';
            tooltip.classList.add('visible');
        }

        function moveTooltip(e) {
            const tooltip = document.getElementById('tooltip');
            if (!tooltip || isMobile) return;
            const x = Math.min(e.clientX + 15, window.innerWidth - tooltip.offsetWidth - 10);
            const y = Math.min(e.clientY + 15, window.innerHeight - tooltip.offsetHeight - 10);
            tooltip.style.left = `${x}px`;
            tooltip.style.top = `${y}px`;
        }

        function hideTooltip() {
            const tooltip = document.getElementById('tooltip');
            if (tooltip) tooltip.classList.remove('visible');
        }

        function openPanel(data) {
            document.getElementById('info-panel').classList.add('open');

            const relatedConnections = [];
            networkData.connections.forEach(conn => {
                if (conn.from === data.id || conn.to === data.id) {
                    const otherId = conn.from === data.id ? conn.to : conn.from;
                    const otherNode = nodes.find(n => n.userData.id === otherId);
                    if (otherNode) {
                        const direction = conn.from === data.id ? '→' : '←';
                        relatedConnections.push({ name: otherNode.userData.name, weight: conn.strength, direction });
                    }
                }
            });
            relatedConnections.sort((a, b) => b.weight - a.weight);

            const panel = document.getElementById('panel-content');
            panel.textContent = '';

            // Helper to create elements safely
            const el = (tag, cls, text) => {
                const e = document.createElement(tag);
                if (cls) e.className = cls;
                if (text) e.textContent = text;
                return e;
            };

            // Info header
            const header = el('div', 'info-header');
            const iconWrap = el('div', 'info-icon');
            iconWrap.style.background = 'var(--gradient-primary)';
            const iconEl = document.createElement('i');
            iconEl.className = 'fa-solid ' + data.icon.replace(/[^a-z0-9 -]/gi, '');
            iconWrap.appendChild(iconEl);
            header.appendChild(iconWrap);

            const titleWrap = el('div', 'info-title-wrap');
            titleWrap.appendChild(el('h2', 'info-title', data.name));
            titleWrap.appendChild(el('div', 'info-subtitle', data.layerLabel + ' • ' + data.year));
            const accent = el('div', 'info-accent-line');
            titleWrap.appendChild(accent);
            header.appendChild(titleWrap);
            panel.appendChild(header);

            // Description
            panel.appendChild(el('p', 'info-description', data.description));

            // Tags
            const tagSection = el('div', 'info-section');
            tagSection.appendChild(el('div', 'info-section-title', 'Attributes'));
            const tagContainer = el('div', 'info-tags');
            data.tags.forEach(t => tagContainer.appendChild(el('span', 'info-tag', t)));
            tagSection.appendChild(tagContainer);
            panel.appendChild(tagSection);

            // Connections
            const connSection = el('div', 'info-section');
            connSection.appendChild(el('div', 'info-section-title', 'Connections'));
            const connContainer = el('div', 'info-connections');
            relatedConnections.slice(0, 4).forEach(conn => {
                const connEl = el('div', 'info-connection');
                connEl.appendChild(el('span', 'connection-name', conn.direction + ' ' + conn.name));
                connEl.appendChild(el('span', 'connection-weight', (conn.weight * 100).toFixed(0) + '%'));
                connContainer.appendChild(connEl);
            });
            connSection.appendChild(connContainer);
            panel.appendChild(connSection);

            // Activation meter
            const meter = el('div', 'activation-meter');
            const meterHeader = el('div', 'activation-header');
            meterHeader.appendChild(el('span', 'activation-label', 'Activation'));
            meterHeader.appendChild(el('span', 'activation-value', (data.activation * 100).toFixed(1) + '%'));
            meter.appendChild(meterHeader);
            const bar = el('div', 'activation-bar');
            const fill = el('div', 'activation-fill');
            fill.style.width = (data.activation * 100) + '%';
            bar.appendChild(fill);
            meter.appendChild(bar);
            panel.appendChild(meter);

            // Share button
            const shareBtn = document.createElement('button');
            shareBtn.className = 'share-link-btn';
            shareBtn.addEventListener('click', copyShareLink);
            const shareIcon = document.createElement('i');
            shareIcon.className = 'fa-solid fa-share-nodes';
            shareBtn.appendChild(shareIcon);
            shareBtn.appendChild(document.createTextNode(' Copy Share Link'));
            panel.appendChild(shareBtn);
        }

        function closePanel() {
            document.getElementById('info-panel').classList.remove('open');
            selectedNode = null;
            hoveredNode = null;
            updateURL(null);
        }

        function resetCamera() {
            if (currentView === 'timeline') {
                targetCameraTarget.set(24, 0, 0);
                targetCameraDistance = isMobile ? 60 : 55;
                targetCameraAngleY = 0.1;
            } else {
                targetCameraTarget.set(0, 0, 0);
                targetCameraDistance = isMobile ? 42 : 38;
                targetCameraAngleY = 0.2;
            }
            targetCameraAngleX = 0;
        }

        function cameraToSection(sectionId) {
            const layerMap = { 'input': -20, 'hidden': 0, 'output': 20 };
            targetCameraTarget.x = layerMap[sectionId] || 0;
            targetCameraDistance = isMobile ? 26 : 22;

            // Update nav tabs
            document.querySelectorAll('.nav-tab, .nav-center button').forEach(b => b.classList.remove('active'));
            event.target.classList.add('active');
        }

        function toggleAutoRotate() {
            autoRotate = !autoRotate;
            document.getElementById('autoRotateBtn').classList.toggle('active', autoRotate);
        }

        function triggerPulse() {
            nodes.forEach((node, i) => {
                setTimeout(() => {
                    node.material.emissiveIntensity = 1.5;
                    node.scale.set(1.4, 1.4, 1.4);
                }, i * 40);
            });
            connections.forEach((conn, i) => {
                setTimeout(() => createDataPacket(conn), i * 25);
            });
            setTimeout(() => {
                nodes.forEach(node => {
                    if (node !== hoveredNode && node !== selectedNode) {
                        node.material.emissiveIntensity = 0.4;
                        node.scale.set(1, 1, 1);
                    }
                });
            }, 2500);
        }

        function highlightActivations() {
            nodes.forEach((node, i) => {
                setTimeout(() => {
                    node.material.emissiveIntensity = node.userData.activation * 1.5;
                    const scale = 0.8 + node.userData.activation * 0.6;
                    node.scale.set(scale, scale, scale);
                }, i * 35);
            });
            setTimeout(() => {
                nodes.forEach(node => {
                    if (node !== hoveredNode && node !== selectedNode) {
                        node.material.emissiveIntensity = 0.4;
                        node.scale.set(1, 1, 1);
                    }
                });
            }, 3500);
        }

        // ============================================
        // THEME
        // ============================================

        function initTheme() {
            const savedTheme = localStorage.getItem('theme');
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (savedTheme) {
                document.documentElement.setAttribute('data-theme', savedTheme);
            } else if (prefersDark) {
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                // Explicitly set light so CSS :not([data-theme="light"]) fallback is overridden
                document.documentElement.setAttribute('data-theme', 'light');
            }
        }

        function toggleTheme() {
            const current = document.documentElement.getAttribute('data-theme');
            const newTheme = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateSceneForTheme();
            updateLegendColors();
        }

        function updateSceneForTheme() {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const bgColor = isDark ? 0x030305 : 0xf8fafc;
            const gridColor = isDark ? 0x00f0ff : 0x7c3aed;

            scene.background = new THREE.Color(bgColor);
            scene.fog.color = new THREE.Color(bgColor);

            if (gridLines) {
                gridLines.material.color = new THREE.Color(gridColor);
            }

            nodes.forEach(node => {
                const layer = networkData.layers.find(l => l.nodes.some(n => n.id === node.userData.id));
                if (layer) {
                    const colorHex = getComputedStyle(document.documentElement).getPropertyValue(layer.colorVar).trim();
                    const newColor = new THREE.Color(colorHex);
                    node.material.color = newColor;
                    node.material.emissive = newColor;
                    node.userData.color = newColor;
                    if (node.children[0] && !node.children[0].userData?.isLabel) {
                        node.children[0].material.color = newColor;
                    }
                }
            });
            
            timelineLines.forEach(line => {
                line.material.color = new THREE.Color(gridColor);
            });
        }

        function updateLegendColors() {
            const legendInput = document.getElementById('legend-input');
            if (!legendInput) return;
            
            document.getElementById('legend-input').style.background = getComputedStyle(document.documentElement).getPropertyValue('--color-input');
            document.getElementById('legend-hidden1').style.background = getComputedStyle(document.documentElement).getPropertyValue('--color-hidden1');
            document.getElementById('legend-hidden2').style.background = getComputedStyle(document.documentElement).getPropertyValue('--color-hidden2');
            document.getElementById('legend-hidden3').style.background = getComputedStyle(document.documentElement).getPropertyValue('--color-hidden3');
            document.getElementById('legend-output').style.background = getComputedStyle(document.documentElement).getPropertyValue('--color-output');
        }

        // ============================================
        // AMBIENT CSS PARTICLES
        // ============================================

        function createAmbientParticles() {
            const container = document.getElementById('ambient-particles');
            if (!container) return;
            
            const particleCount = isMobile ? 8 : 20;
            const colors = ['--color-input', '--color-hidden1', '--color-hidden2', '--color-hidden3', '--color-output'];
            
            for (let i = 0; i < particleCount; i++) {
                const particle = document.createElement('div');
                particle.classList.add('ambient-particle');
                
                const size = Math.random() * 3 + 1.5;
                const colorVar = colors[Math.floor(Math.random() * colors.length)];
                const color = getComputedStyle(document.documentElement).getPropertyValue(colorVar).trim();
                
                particle.style.cssText = `
                    width: ${size}px;
                    height: ${size}px;
                    background: ${color};
                    left: ${Math.random() * 100}%;
                    animation-duration: ${Math.random() * 8 + 8}s;
                    animation-delay: ${Math.random() * 10}s;
                    box-shadow: 0 0 ${size * 3}px ${color};
                `;
                
                container.appendChild(particle);
            }
        }

        // ============================================
        // CUSTOM CURSOR - Desktop Only
        // ============================================

        function setupCustomCursor() {
            if (isMobile) return;
            
            const cursor = document.createElement('div');
            cursor.classList.add('custom-cursor');
            document.body.appendChild(cursor);
            
            const cursorDot = document.createElement('div');
            cursorDot.classList.add('custom-cursor-dot');
            document.body.appendChild(cursorDot);
            
            let cursorX = window.innerWidth / 2;
            let cursorY = window.innerHeight / 2;
            let dotX = cursorX, dotY = cursorY;
            
            document.addEventListener('mousemove', (e) => {
                cursorX = e.clientX;
                cursorY = e.clientY;
                dotX += (cursorX - dotX) * 0.4;
                dotY += (cursorY - dotY) * 0.4;
                
                cursor.style.left = cursorX + 'px';
                cursor.style.top = cursorY + 'px';
                cursorDot.style.left = dotX + 'px';
                cursorDot.style.top = dotY + 'px';
                
                // Check if hovering over interactive element
                const target = document.elementFromPoint(cursorX, cursorY);
                const isInteractive = target && (
                    target.closest('button') || 
                    target.closest('a') || 
                    target.closest('input') ||
                    target.closest('select') ||
                    target.closest('.interactive') ||
                    target.closest('.nav-tab') ||
                    target.closest('.quick-btn')
                );
                
                cursor.classList.toggle('hovering', !!isInteractive);
            });
            
            document.addEventListener('mouseleave', () => {
                cursor.style.opacity = '0';
                cursorDot.style.opacity = '0';
            });
            
            document.addEventListener('mouseenter', () => {
                cursor.style.opacity = '1';
                cursorDot.style.opacity = '1';
            });
        }

        // ============================================
        // MAGNETIC BUTTONS - Desktop Only
        // ============================================

        function setupMagneticButtons() {
            if (isMobile) return;
            
            const magneticElements = document.querySelectorAll('.icon-btn, .fab, .quick-btn, .nav-tab, .social-link');
            
            magneticElements.forEach(el => {
                el.classList.add('magnetic');
                
                el.addEventListener('mousemove', (e) => {
                    const rect = el.getBoundingClientRect();
                    const x = e.clientX - rect.left - rect.width / 2;
                    const y = e.clientY - rect.top - rect.height / 2;
                    
                    const strength = 0.3;
                    const maxDist = 8;
                    const dist = Math.sqrt(x * x + y * y);
                    
                    if (dist < rect.width) {
                        const moveX = Math.min(Math.max(x * strength, -maxDist), maxDist);
                        const moveY = Math.min(Math.max(y * strength, -maxDist), maxDist);
                        el.style.transform = `translate(${moveX}px, ${moveY}px)`;
                    }
                });
                
                el.addEventListener('mouseleave', () => {
                    el.style.transform = 'translate(0, 0)';
                });
            });
        }

        function typeWriterEffect() {
            const roles = [
                "AI/ML Engineer in Training",
                "Physician → AI Innovator",
                "SUTD Trailblazers Scholar",
                "CGPA 3.94 @ Singapore Poly"
            ];
            let roleIndex = 0, charIndex = 0, isDeleting = false;
            const element = document.getElementById('typing-text');
            if (!element) return;

            function type() {
                const currentRole = roles[roleIndex];
                if (isDeleting) {
                    element.textContent = currentRole.substring(0, charIndex - 1);
                    charIndex--;
                } else {
                    element.textContent = currentRole.substring(0, charIndex + 1);
                    charIndex++;
                }

                let typeSpeed = isDeleting ? 40 : 80;
                if (!isDeleting && charIndex === currentRole.length) {
                    typeSpeed = 2500;
                    isDeleting = true;
                } else if (isDeleting && charIndex === 0) {
                    isDeleting = false;
                    roleIndex = (roleIndex + 1) % roles.length;
                    typeSpeed = 400;
                }
                setTimeout(type, typeSpeed);
            }
            type();
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
