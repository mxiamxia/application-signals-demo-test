const NutritionFact = require('./nutrition-fact');
const logger = require('pino')();

/**
 * Loads the nutrutionfact collection with static data. Yes this will drop
 * the collection if it already exists. This is just for demo purposes.
 */

module.exports = function(){
  NutritionFact.collection.drop()
    .then(() => logger.info('collection dropped'))
    .catch(err => logger.error('error dropping collection:', err));

  NutritionFact.insertMany([
    { pet_type: 'cat', facts: 'High-protein, grain-free dry or wet food with real meat as the main ingredient' },
    { pet_type: 'dog', facts: 'Balanced dog food with quality proteins, fats, and carbohydrates' },
    { pet_type: 'lizard', facts: 'Insects, leafy greens, and calcium supplements' },
    { pet_type: 'snake', facts: 'Whole prey (mice/rats) based on size' },
    { pet_type: 'bird', facts: 'High-quality seeds, pellets, and fresh fruits/veggies' },
    { pet_type: 'hamster', facts: 'Pellets, grains, fresh vegetables, and occasional fruits' },
    // Add missing pet types that AI agents support
    { pet_type: 'rabbit', facts: 'High-fiber pellets, unlimited timothy hay, fresh leafy greens, and limited fruits' },
    { pet_type: 'guinea pig', facts: 'Vitamin C-rich pellets, unlimited timothy hay, fresh vegetables, and limited fruits' },
    { pet_type: 'ferret', facts: 'High-protein, high-fat, low-carbohydrate diet with frequent small meals' },
    { pet_type: 'fish', facts: 'Species-appropriate flakes, pellets, or live food with proper feeding frequency' },
    { pet_type: 'horse', facts: 'Forage-based diet with hay, grass, and grain supplements as needed' },
    { pet_type: 'reptile', facts: 'Species-specific diet including insects, vegetables, or prey items with calcium supplements' },
    { pet_type: 'amphibian', facts: 'Live or frozen insects, worms, and species-appropriate aquatic foods' }
  ])
    .then(() => logger.info('collection populated with all supported pet types'))
    .catch(err => logger.error('error populating collection:', err));
};