import DashOptions from '../interfaces/dash-options';
import EventsList from '../interfaces/events-list';
import Source from '../interfaces/source';
import { HAS_MSE } from '../utils/constants';
import { addEvent } from '../utils/events';
import { loadScript } from '../utils/general';
import { isDashSource } from '../utils/media';
import Native from './native';

declare const dashjs: any;

/**
 * M(PEG)-DASH Media.
 *
 * @description Class that handles MPD files using dash.js within the player
 * @see https://github.com/Dash-Industry-Forum/dash.js/
 * @see https://github.com/Dash-Industry-Forum/dash.js/wiki/Migration-3.0
 * @class DashMedia
 */
class DashMedia extends Native {
    /**
     * Instance of dashjs player.
     *
     * @type dashjs
     * @memberof DashMedia
     */
    private player: any;

    /**
     * DashJS events that will be triggered in Player.
     *
     * @see http://cdn.dashjs.org/latest/jsdoc/MediaPlayerEvents.html
     * @type EventsList
     * @memberof DashMedia
     */
    private events: EventsList = {};

    private options?: DashOptions = {};

    /**
     * Creates an instance of DashMedia.
     *
     * @param {HTMLMediaElement} element
     * @param {Source} mediaSource
     * @memberof DashMedia
     */
    constructor(element: HTMLMediaElement, mediaSource: Source, options?: DashOptions) {
        super(element, mediaSource);
        this.options = options;

        this.promise = (typeof dashjs === 'undefined') ?
            // Ever-green script
            loadScript('https://cdn.dashjs.org/latest/dash.all.min.js') :
            new Promise(resolve => {
                resolve({});
            });

        this.promise.then(() => {
            this.player = dashjs.MediaPlayer().create();
            this.instance = this.player;
        });
        return this;
    }

    /**
     *
     * @inheritDoc
     * @memberof DashMedia
     */
    public canPlayType(mimeType: string) {
        return HAS_MSE && mimeType === 'application/dash+xml';
    }

    /**
     *
     * @inheritDoc
     * @memberof DashMedia
     */
    public load() {
        this._preparePlayer();
        this.player.attachSource(this.media.src);

        const e = addEvent('loadedmetadata');
        this.element.dispatchEvent(e);

        if (!this.events) {
            this.events = dashjs.MediaPlayer.events;
            Object.keys(this.events).forEach(event => {
                this.player.on(this.events[event], this._assign.bind(this));
            });
        }
    }

    /**
     *
     * @inheritDoc
     * @memberof DashMedia
     */
    public destroy() {
        this._revoke();
    }

    /**
     *
     * @inheritDoc
     * @memberof DashMedia
     */
    set src(media: Source) {
        if (isDashSource(media)) {
            this._revoke();
            this.player = dashjs.MediaPlayer().create();
            this._preparePlayer();
            this.player.attachSource(media.src);

            this.events = dashjs.MediaPlayer.events;
            Object.keys(this.events).forEach(event => {
                this.player.on(this.events[event], this._assign.bind(this));
            });
        }
    }

    get levels() {
        const levels: any = [];
        if (this.player) {
            const bitrates = this.player.getBitrateInfoListFor('video');
            if (bitrates.length) {
                bitrates.forEach((item: number) => {
                    if (bitrates[item]) {
                        const { height, name } = bitrates[item];
                        const level = {
                            height,
                            id: item,
                            label: name || null,
                        };
                        levels.push(level);
                    }
                });
            }
        }
        return levels;
    }

    set level(level: number) {
        if (level === 0) {
            this.player.setAutoSwitchQuality(true);
        } else {
            this.player.setAutoSwitchQuality(false);
            this.player.setQualityFor('video', level);
        }
    }

    get level() {
        return this.player ? this.player.getQualityFor('video') : -1;
    }

    /**
     * Custom M(PEG)-DASH events
     *
     * These events can be attached to the original node using addEventListener and the name of the event,
     * not using dashjs.MediaPlayer.events object
     * @see http://cdn.dashjs.org/latest/jsdoc/MediaPlayerEvents.html
     * @param {dashjs.MediaPlayerEvents.events} event
     */
    private _assign(event: any): void {
        if (event.type === 'error') {
            const details = {
                detail: {
                    message: event,
                    type: 'M(PEG)-DASH',
                },
            };
            const errorEvent = addEvent('playererror', details);
            this.element.dispatchEvent(errorEvent);
        } else {
            const e = addEvent(event.type, event);
            this.element.dispatchEvent(e);
        }
    }

    /**
     * Remove all dash.js events and destroy dashjs player instance.
     *
     * @memberof DashMedia
     */
    private _revoke(): void {
        if (this.events) {
            Object.keys(this.events).forEach(event => {
                this.player.off(this.events[event], this._assign.bind(this));
            });
            this.events = [];
        }
        this.player.reset();
    }

    /**
     * Set player with proper configuration to have better performance.
     *
     * Also, considers the addition of DRM settings.
     *
     * @memberof DashMedia
     */
    private _preparePlayer() {
        // In version 3x, `getDebug` is deprecated
        if (typeof this.player.getDebug().setLogToBrowserConsole === 'undefined') {
            this.player.updateSettings({
                debug: {
                    logLevel: dashjs.Debug.LOG_LEVEL_NONE,
                },
                streaming: {
                    fastSwitchEnabled: true,
                    scheduleWhilePaused: false,
                },
            });
        } else {
            this.player.getDebug().setLogToBrowserConsole(false);
            this.player.setScheduleWhilePaused(false);
            this.player.setFastSwitchEnabled(true);
        }
        this.player.initialize();
        this.player.attachView(this.element);
        this.player.setAutoPlay(false);

        // If DRM is set, load protection data
        if (this.options && typeof this.options.drm === 'object' && Object.keys(this.options.drm).length) {
            this.player.setProtectionData(this.options.drm);
            if (this.options.robustnessLevel && this.options.robustnessLevel) {
                this.player.getProtectionController().setRobustnessLevel(this.options.robustnessLevel);
            }
        }
    }
}

export default DashMedia;
