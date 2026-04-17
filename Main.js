// ==UserScript==
// @name         Cockpit cam fix
// @namespace    https://tampermonkey.net/
// @version      1.1
// @description  This script fixes the cockpit camera view in various aircraft.
// @author       SpeedBird
// @match        https://www.geo-fs.com/geofs.php
// @match        https://www.geo-fs.com/geofs.php?v=3.9
// @run-at       document-idle
// @grant        none
// ==/UserScript==


(function () {
    "use strict";

    const CAMERA_PRESETS = new Map([
        [2769, {
            position: { offset: [0, 0.05, 0.05] },
            orientation: { absolute: [0, -12, 0] },
        }],
        [2856, {
            position: { offset: [0.15, 0.2, 0.1] },
            orientation: { absolute: [0, -12, 0] },
        }],
        [5086, {
            position: { offset: [0.15, 0, 0.15] },
            orientation: { absolute: [0, -12, 0] },
        }],
        [3011, {
            position: { offset: [0.15, 0.2, 0.1] },
            orientation: { absolute: [0, -12, 0] },
        }],
        [3534, {
            position: { offset: [0.15, 0.2, 0.08] },
            orientation: { absolute: [0, -12, 0] },
        }],
        [2871, {
            position: { offset: [0.15, 0.3, 0.05] },
            orientation: { absolute: [0, -12, 0] },
        }],
        [4646, {
            position: { offset: [0.15, 0.2, 0.1] },
            orientation: { absolute: [0, -12, 0] },
        }],
        [3054, {
            position: { offset: [0, 0, 0.05] },
            orientation: { absolute: [0, -12, 0] },
        }],
        [4631, {
            position: { offset: [0, 0.4, 0.07] },
            orientation: { absolute: [0, -12, 0] },
        }],
        [2951, {
            position: { offset: [0.1, 0.2, 0.1] },
            orientation: { absolute: [0, -12, 0] },
        }],
        [5073, {
            position: { offset: [-0.025, 0, 0.1] },
            orientation: { absolute: [0, -12, 0] },
        }],
        [5551, {
            position: { offset: [0, -0.27, 0] },
            orientation: { absolute: [0, -12, 0] },
        }],
        [2943, {
            position: { offset: [0, -0.1, 0.2] },
            orientation: { absolute: [0, -12, 0] },
        }],
        [5038, {
            position: { offset: [0.05, -0.2, 0] },
            orientation: { absolute: [0, -12, 0] },
        }],
        [5, {
            position: { offset: [0, -0.2, 0] },
            orientation: { absolute: [0, -12, 0] },
        }],
        [6, {
            position: { offset: [0, -0.2, 0.1] },
            orientation: { absolute: [0, -12, 0] },
        }],
        [20, {
            position: { offset: [0, -0.2, 0.06] },
            orientation: { absolute: [0, -12, 0] },
        }],
        [16, {
            position: { offset: [0.1, -0.1, 0] },
            orientation: { absolute: [0, -12, 0] },
        }],
        [13, {
            position: { offset: [0, -0.2, 0] },
            orientation: { absolute: [0, -12, 0] },
        }],
    ]);
    const TARGET_AIRCRAFT_IDS = Array.from(CAMERA_PRESETS.keys());
    const APPLY_INTERVAL_MS = 500;
    const RAPID_CHECK_INTERVAL_MS = 100;
    const POSITION_TOLERANCE = 0.001;
    const BASE_REFRESH_TOLERANCE = 0.05;

    const log = (...args) => console.log("[CockpitCamFix]", ...args);

    let lastStatus = "";
    let lastAppliedPosition = null;
    let isOverrideActive = false;
    const originalCameraState = new WeakMap();

    const setStatus = (message) => {
        if (message !== lastStatus) {
            log(message);
            lastStatus = message;
        }
    };

    const isVector = (value) => Array.isArray(value) || ArrayBuffer.isView(value);

    const toArray = (vector) => (isVector(vector) ? Array.from(vector) : null);

    const cloneVector = toArray;

    const getNormalizedAircraftId = (instance) => {
        const rawId =
            instance?.id ??
            instance?.aircraftRecord?.id ??
            instance?.definition?.id ??
            null;

        if (rawId == null) {
            return null;
        }

        if (typeof rawId === "number" && !Number.isNaN(rawId)) {
            return rawId;
        }

        const numeric = Number(rawId);
        if (!Number.isNaN(numeric)) {
            return numeric;
        }

        const match = String(rawId).match(/(\d+)/);
        return match ? Number(match[1]) : null;
    };

    const getCockpitCamera = (instance) => instance?.definition?.cameras?.cockpit ?? null;

    function vectorsApproximatelyEqual(a, b, tolerance = POSITION_TOLERANCE) {
        const left = toArray(a);
        const right = toArray(b);

        if (!left || !right || left.length !== right.length) {
            return false;
        }

        return left.every((value, index) => Math.abs(value - right[index]) <= tolerance);
    }

    function captureBaseState(cockpit, aircraftId) {
        const state = {
            basePosition: cloneVector(cockpit.position),
            baseOrientation: cloneVector(cockpit.orientation),
            aircraftId,
        };

        originalCameraState.set(cockpit, state);
        lastAppliedPosition = null;
        isOverrideActive = false;
        return state;
    }

    function refreshBaseState(state, cockpit) {
        if (!state || isOverrideActive) {
            return;
        }

        if (
            isVector(cockpit.position) &&
            (!isVector(state.basePosition) ||
                !vectorsApproximatelyEqual(state.basePosition, cockpit.position, BASE_REFRESH_TOLERANCE))
        ) {
            state.basePosition = cloneVector(cockpit.position);
        }

        if (
            isVector(cockpit.orientation) &&
            (!isVector(state.baseOrientation) ||
                !vectorsApproximatelyEqual(state.baseOrientation, cockpit.orientation, BASE_REFRESH_TOLERANCE))
        ) {
            state.baseOrientation = cloneVector(cockpit.orientation);
        }
    }

    function ensureCameraState(cockpit, aircraftId) {
        let state = originalCameraState.get(cockpit);
        if (!state || state.aircraftId !== aircraftId) {
            state = captureBaseState(cockpit, aircraftId);
        } else {
            refreshBaseState(state, cockpit);
        }

        return state;
    }

    function isCockpitViewActive() {
        const viewName =
            geofs.camera?.currentView?.name ||
            geofs.view?.current?.name ||
            "";
        return viewName.toLowerCase().includes("cockpit");
    }

    function refreshCockpitView() {
        let refreshed = false;
        try {
            if (typeof geofs?.camera?.setToView === "function" && geofs.camera.currentView) {
                geofs.camera.setToView(geofs.camera.currentView);
                refreshed = true;
            }

            if (typeof geofs?.view?.set === "function" && geofs.view?.current?.id != null) {
                geofs.view.set(geofs.view.current.id);
                refreshed = true;
            }

            if (typeof geofs?.actions?.cockpitView === "function" && isCockpitViewActive()) {
                const toggleBack = () => geofs.actions.cockpitView();

                if (typeof geofs?.actions?.outsideView === "function") {
                    geofs.actions.outsideView();
                    setTimeout(toggleBack, 100);
                } else {
                    toggleBack();
                    setTimeout(toggleBack, 100);
                }

                refreshed = true;
            }
        } catch (error) {
            log("Failed to refresh cockpit view", error);
        }

        return refreshed;
    }

    function resolveVector(baseVector = [], config) {
        const base = cloneVector(baseVector) ?? [];

        if (!config) {
            return base;
        }

        if (Array.isArray(config)) {
            return config.slice();
        }

        if (Array.isArray(config.absolute)) {
            return config.absolute.slice();
        }

        if (Array.isArray(config.offset)) {
            const maxLength = Math.max(base.length, config.offset.length);
            const result = [];

            for (let index = 0; index < maxLength; index += 1) {
                const baseValue = base[index] ?? 0;
                const offsetValue = config.offset[index] ?? 0;
                result[index] = baseValue + offsetValue;
            }

            return result;
        }

        return base;
    }

    function applyOverride(force = false) {
        const instance = window.geofs?.aircraft?.instance;
        if (!instance) {
            setStatus("Waiting for geofs.aircraft.instance …");
            return;
        }

        const activeId = getNormalizedAircraftId(instance);

        const preset = activeId != null ? CAMERA_PRESETS.get(activeId) : null;
        if (!preset) {
            if (isOverrideActive) {
                isOverrideActive = false;
                lastAppliedPosition = null;
            }
            setStatus(
                `Active aircraft ID ${instance?.id ?? "unknown"} not in presets ${TARGET_AIRCRAFT_IDS.join(
                    ", "
                )} (normalized ${activeId})`
            );
            return;
        }

        const cockpit = getCockpitCamera(instance);
        if (!cockpit || !isVector(cockpit.position)) {
            setStatus("Cockpit camera definition not ready yet.");
            return;
        }

        const state = ensureCameraState(cockpit, activeId);
        const basePosition = state.basePosition ?? cockpit.position;
        const baseOrientation = state.baseOrientation ?? cockpit.orientation;

        const nextPosition = resolveVector(basePosition, preset.position);
        const positionChanged = !lastAppliedPosition ||
            !vectorsApproximatelyEqual(lastAppliedPosition, nextPosition, POSITION_TOLERANCE / 10);

        const currentPosition = cloneVector(cockpit.position) ?? [];
        const needsCorrection = force || positionChanged ||
            !vectorsApproximatelyEqual(currentPosition, nextPosition, POSITION_TOLERANCE);

        if (needsCorrection) {
            nextPosition.forEach((value, index) => {
                cockpit.position[index] = value;
            });

            if (isVector(cockpit.orientation)) {
                const nextOrientation = resolveVector(baseOrientation, preset.orientation);
                nextOrientation.forEach((value, index) => {
                    cockpit.orientation[index] = value;
                });
            }

            lastAppliedPosition = nextPosition.slice();
            isOverrideActive = true;

            if (typeof geofs?.camera?.setToView === "function" && geofs.camera.currentView) {
                geofs.camera.setToView(geofs.camera.currentView);
            }

            if (!refreshCockpitView()) {
                log("Toggle cockpit view manually if camera did not move.");
            }

            setStatus("Applied cockpit camera override.");
        }
    }

    function rapidCheck() {
        const instance = window.geofs?.aircraft?.instance;
        if (!instance || !isOverrideActive) return;

        const activeId = getNormalizedAircraftId(instance);

        const preset = activeId != null ? CAMERA_PRESETS.get(activeId) : null;
        if (!preset) return;

        const cockpit = getCockpitCamera(instance);
        if (!cockpit || !isVector(cockpit.position) || !lastAppliedPosition) return;

        const state = ensureCameraState(cockpit, activeId);
        const basePosition = state.basePosition ?? cockpit.position;

        const expectedPosition = resolveVector(basePosition, preset.position);
        const currentPosition = cloneVector(cockpit.position) ?? [];
        const positionDrifted = !vectorsApproximatelyEqual(currentPosition, expectedPosition, POSITION_TOLERANCE);

        if (positionDrifted) {
            log("Camera position drift detected, reapplying override...");
            applyOverride(true);
        }
    }

    function waitForGeoFs() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const timer = setInterval(() => {
                attempts += 1;
                if (window.geofs?.aircraft?.instance) {
                    clearInterval(timer);
                    resolve();
                } else if (attempts > 120) {
                    clearInterval(timer);
                    reject(new Error("GeoFS API not detected"));
                }
            }, 250);
        });
    }

    function setupCameraMonitoring() {
        const originalSetToView = geofs.camera?.setToView;
        const originalSet = geofs.view?.set;
        const originalCockpitView = geofs.actions?.cockpitView;
        const originalOutsideView = geofs.actions?.outsideView;

        if (originalSetToView) {
            geofs.camera.setToView = function(view) {
                const result = originalSetToView.call(this, view);
                setTimeout(() => {
                    if (isOverrideActive && view?.name?.toLowerCase().includes('cockpit')) {
                        applyOverride(true);
                    }
                }, 50);
                return result;
            };
        }

        if (originalSet) {
            geofs.view.set = function(viewId) {
                const result = originalSet.call(this, viewId);
                setTimeout(() => {
                    if (isOverrideActive && this.current?.name?.toLowerCase().includes('cockpit')) {
                        applyOverride(true);
                    }
                }, 50);
                return result;
            };
        }

        if (originalCockpitView) {
            geofs.actions.cockpitView = function() {
                const result = originalCockpitView.call(this);
                setTimeout(() => {
                    if (isOverrideActive) {
                        applyOverride(true);
                    }
                }, 50);
                return result;
            };
        }

        if (originalOutsideView) {
            geofs.actions.outsideView = function() {
                const result = originalOutsideView.call(this);
                setTimeout(() => {
                    if (isOverrideActive) {
                        applyOverride(true);
                    }
                }, 50);
                return result;
            };
        }
    }

    waitForGeoFs()
        .then(() => {
            log("GeoFS detected; monitoring cockpit camera for aircraft", TARGET_AIRCRAFT_IDS);
            setupCameraMonitoring();
            applyOverride();
            const intervalId = setInterval(applyOverride, APPLY_INTERVAL_MS);
            const rapidIntervalId = setInterval(rapidCheck, RAPID_CHECK_INTERVAL_MS);

            window.stopCockpitCamFix = () => {
                clearInterval(intervalId);
                clearInterval(rapidIntervalId);
                log("Stopped cockpit camera override intervals");
            };
        })
        .catch((error) => log("Initialization failed", error));
})();