"""
Transit cost estimation service for Indian public transportation.
Provides estimates based on typical fares in major Indian cities.
"""

import re
from typing import List, Dict, Any, Tuple, Optional
from math import ceil


class TransitCostEstimator:
    """Estimates transit costs for Indian public transportation."""
    
    # Base rates for different transit modes (in INR)
    TRANSIT_RATES = {
        # Metro/Subway rates (per km)
        'subway': {'base': 10, 'per_km': 2, 'max': 60},
        'metro': {'base': 10, 'per_km': 2, 'max': 60},
        
        # Bus rates 
        'bus': {'base': 8, 'per_km': 1.5, 'max': 50},
        'city_bus': {'base': 8, 'per_km': 1.5, 'max': 50},
        
        # Train rates (suburban/local)
        'train': {'base': 5, 'per_km': 0.8, 'max': 40},
        'local_train': {'base': 5, 'per_km': 0.8, 'max': 40},
        
        # Long distance bus
        'intercity_bus': {'base': 50, 'per_km': 3, 'max': 500},
        
        # Auto/Taxi (for short connections)
        'taxi': {'base': 25, 'per_km': 12, 'max': 200},
        'auto': {'base': 20, 'per_km': 10, 'max': 150},
        
        # Default fallback
        'default': {'base': 10, 'per_km': 2, 'max': 60}
    }
    
    # City-specific multipliers
    CITY_MULTIPLIERS = {
        'mumbai': 1.3,
        'delhi': 1.2,
        'bangalore': 1.1,
        'bengaluru': 1.1,
        'chennai': 1.0,
        'hyderabad': 1.0,
        'kolkata': 0.9,
        'pune': 1.0,
        'ahmedabad': 0.9,
        'default': 1.0
    }

    @classmethod
    def detect_city(cls, route_data: Dict[str, Any]) -> str:
        """Detect city from route data for cost estimation."""
        # Try to extract city from start/end addresses
        text_to_search = ""
        if 'legs' in route_data:
            for leg in route_data['legs']:
                text_to_search += leg.get('start_address', '') + ' '
                text_to_search += leg.get('end_address', '') + ' '
        
        text_lower = text_to_search.lower()
        
        for city in cls.CITY_MULTIPLIERS:
            if city in text_lower:
                return city
        
        return 'default'

    @classmethod
    def classify_transit_mode(cls, instruction: str, distance_km: float = 0) -> str:
        """Classify transit mode from instruction text."""
        instruction_lower = instruction.lower()
        
        # Metro/Subway keywords
        if any(word in instruction_lower for word in ['metro', 'subway', 'purple line', 'blue line', 'green line', 'red line']):
            return 'metro'
        
        # Bus keywords
        if any(word in instruction_lower for word in ['bus', 'bmtc', 'best', 'dtc', 'ksrtc']):
            # Long distance bus detection
            if distance_km > 50 or any(word in instruction_lower for word in ['travels', 'transport', 'express']):
                return 'intercity_bus'
            return 'bus'
        
        # Train keywords
        if any(word in instruction_lower for word in ['train', 'railway', 'local', 'suburban']):
            return 'train'
        
        # Auto/Taxi keywords (for short segments)
        if any(word in instruction_lower for word in ['auto', 'rickshaw']):
            return 'auto'
        if any(word in instruction_lower for word in ['taxi', 'cab', 'uber', 'ola']):
            return 'taxi'
        
        return 'default'

    @classmethod
    def extract_distance_from_instruction(cls, instruction: str) -> float:
        """Extract distance in km from instruction text."""
        # Look for patterns like "15 km", "2.5 kilometers", etc.
        patterns = [
            r'(\d+\.?\d*)\s*km',
            r'(\d+\.?\d*)\s*kilometer',
            r'(\d+\.?\d*)\s*kms'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, instruction.lower())
            if match:
                return float(match.group(1))
        
        return 0.0

    @classmethod
    def calculate_segment_cost(cls, instruction: str, city_multiplier: float = 1.0) -> Dict[str, Any]:
        """Calculate cost for a single transit segment."""
        distance_km = cls.extract_distance_from_instruction(instruction)
        transit_mode = cls.classify_transit_mode(instruction, distance_km)
        
        # Get rate structure
        rates = cls.TRANSIT_RATES.get(transit_mode, cls.TRANSIT_RATES['default'])
        
        # Calculate base cost
        if distance_km > 0:
            cost = rates['base'] + (distance_km * rates['per_km'])
        else:
            # If no distance found, use average cost based on mode
            cost = rates['base'] + (5 * rates['per_km'])  # Assume 5km average
        
        # Apply city multiplier
        cost *= city_multiplier
        
        # Cap at maximum
        cost = min(cost, rates['max'] * city_multiplier)
        
        # Round to nearest rupee
        cost = round(cost)
        
        return {
            'instruction': instruction,
            'mode': transit_mode,
            'distance_km': distance_km,
            'estimated_cost': cost,
            'currency': 'INR'
        }

    @classmethod
    def estimate_total_cost(cls, instructions: List[str], route_info: Dict[str, Any] = None) -> Dict[str, Any]:
        """Estimate total cost for a complete transit route."""
        if not instructions:
            return {
                'total_cost': None,
                'cost_breakdown': [],
                'currency': 'INR',
                'estimation_note': 'No transit instructions available for cost estimation'
            }
        
        # Detect city for multiplier
        city = cls.detect_city(route_info or {})
        city_multiplier = cls.CITY_MULTIPLIERS.get(city, 1.0)
        
        cost_breakdown = []
        total_cost = 0.0
        
        for instruction in instructions:
            # Skip walking instructions for cost calculation
            if any(word in instruction.lower() for word in ['walk', 'walking']):
                continue
            
            segment_cost = cls.calculate_segment_cost(instruction, city_multiplier)
            cost_breakdown.append(segment_cost)
            total_cost += segment_cost['estimated_cost']
        
        # Add small buffer for incidental costs (5-10%)
        total_cost *= 1.05
        total_cost = round(total_cost)
        
        # Create estimation note
        city_name = city.title() if city != 'default' else 'India'
        estimation_note = f"Estimated cost for {city_name} public transport. Actual fares may vary."
        
        return {
            'total_cost': float(total_cost),
            'cost_breakdown': cost_breakdown,
            'currency': 'INR',
            'estimation_note': estimation_note
        }

    @classmethod
    def format_cost_display(cls, cost_data: Dict[str, Any]) -> str:
        """Format cost for display in UI."""
        if not cost_data or not cost_data.get('total_cost'):
            return 'Cost estimate unavailable'
        
        total = cost_data['total_cost']
        currency = cost_data.get('currency', 'INR')
        
        if currency == 'INR':
            return f"₹{total:.0f}"
        else:
            return f"{currency} {total:.2f}"