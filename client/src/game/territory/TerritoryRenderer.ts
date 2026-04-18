/**
 * TerritoryRenderer.ts
 *
 * Renders territories with optimized drawing and visual effects.
 * Uses Phaser Graphics for efficient polygon rendering.
 */

import * as Phaser from 'phaser';
import { Territory, TerritoryCache, Point } from './TerritoryCache';

export class TerritoryRenderer {
  private scene: Phaser.Scene;
  private cache: TerritoryCache;
  private graphics: Phaser.GameObjects.Graphics;
  private warningIcons: Map<string, Phaser.GameObjects.Text> = new Map();

  // Visual settings
  private colors = {
    green: {
      line: 0x00ff00,
      fill: 0x00ff00,
      lineAlpha: 0.8,
      fillAlpha: 0.2,
    },
    orange: {
      line: 0xff6600,
      fill: 0xff6600,
      lineAlpha: 0.9,
      fillAlpha: 0.3,
    },
    gray: {
      line: 0x888888,
      fill: 0x888888,
      lineAlpha: 0.6,
      fillAlpha: 0.15,
    },
  };

  constructor(scene: Phaser.Scene, cache: TerritoryCache) {
    this.scene = scene;
    this.cache = cache;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(5); // Below sharks, above background
  }

  /**
   * Update and redraw all territories
   */
  update(): void {
    // Clear previous frame
    this.graphics.clear();
    this.clearWarningIcons();

    // Remove expired territories
    this.cache.removeExpired();

    // Draw territories by priority: own (green) first, then dangerous (orange)
    this.renderTerritories(this.cache.getMyTerritories(), 'green');
    this.renderTerritories(this.cache.getDangerousTerritories(), 'orange');

    // Optionally draw neutral territories (same level)
    // this.renderTerritories(this.cache.getByColor('gray'), 'gray');
  }

  /**
   * Render territories of a specific color
   */
  private renderTerritories(territories: Territory[], color: 'green' | 'orange' | 'gray'): void {
    const style = this.colors[color];

    this.graphics.lineStyle(3, style.line, style.lineAlpha);
    this.graphics.fillStyle(style.fill, style.fillAlpha);

    for (const territory of territories) {
      this.drawPolygon(territory.polygon);

      // Add warning icon for dangerous territories
      if (color === 'orange') {
        this.drawWarningIcon(territory);
      }
    }
  }

  /**
   * Draw a polygon shape
   */
  private drawPolygon(points: Point[]): void {
    if (points.length < 3) return;

    this.graphics.beginPath();
    this.graphics.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      this.graphics.lineTo(points[i].x, points[i].y);
    }

    this.graphics.closePath();
    this.graphics.strokePath();
    this.graphics.fillPath();
  }

  /**
   * Draw a warning icon at the center of a dangerous territory
   */
  private drawWarningIcon(territory: Territory): void {
    const center = this.calculateCentroid(territory.polygon);

    const icon = this.scene.add.text(center.x, center.y, '⚠', {
      fontSize: '32px',
      color: '#ff6600',
      stroke: '#000000',
      strokeThickness: 3,
    })
      .setOrigin(0.5)
      .setDepth(6);

    // Add pulsing animation
    this.scene.tweens.add({
      targets: icon,
      scale: { from: 1.0, to: 1.2 },
      alpha: { from: 1.0, to: 0.7 },
      duration: 800,
      yoyo: true,
      repeat: -1,
    });

    this.warningIcons.set(territory.id, icon);
  }

  /**
   * Calculate the centroid (center point) of a polygon
   */
  private calculateCentroid(polygon: Point[]): Point {
    let cx = 0;
    let cy = 0;

    for (const point of polygon) {
      cx += point.x;
      cy += point.y;
    }

    return {
      x: cx / polygon.length,
      y: cy / polygon.length,
    };
  }

  /**
   * Clear all warning icons
   */
  private clearWarningIcons(): void {
    this.warningIcons.forEach(icon => icon.destroy());
    this.warningIcons.clear();
  }

  /**
   * Highlight a specific territory (e.g., on hover)
   */
  highlightTerritory(territoryId: string): void {
    const territory = this.cache.get(territoryId);
    if (!territory) return;

    // Draw highlight effect
    this.graphics.lineStyle(5, 0xffffff, 1.0);
    this.drawPolygon(territory.polygon);
  }

  /**
   * Show visual feedback when entering a dangerous territory
   */
  showDangerAlert(territory: Territory): void {
    const center = this.calculateCentroid(territory.polygon);

    // Create pulsing red circle effect
    const circle = this.scene.add.circle(center.x, center.y, 50, 0xff0000, 0.5);
    circle.setDepth(10);

    this.scene.tweens.add({
      targets: circle,
      scale: { from: 1, to: 3 },
      alpha: { from: 0.5, to: 0 },
      duration: 500,
      onComplete: () => circle.destroy(),
    });

    // Optional: Play warning sound
    // this.scene.sound.play('warning');
  }

  /**
   * Debug: Draw territory IDs and levels
   */
  debugDraw(): void {
    const territories = this.cache.getAll();

    territories.forEach(territory => {
      const center = this.calculateCentroid(territory.polygon);
      const label = `${territory.id.substring(0, 8)}\nLv${territory.level}`;

      this.scene.add.text(center.x, center.y + 40, label, {
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 4, y: 2 },
      })
        .setOrigin(0.5)
        .setDepth(20);
    });
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.graphics.destroy();
    this.clearWarningIcons();
  }
}
