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
    // Additional pet types to fix 404 errors identified in Application Signals analysis
    { pet_type: 'rabbit', facts: 'High-fiber hay, timothy pellets, leafy greens, limited fruits' },
    { pet_type: 'guinea pig', facts: 'Vitamin C-rich pellets, unlimited hay, fresh vegetables daily' },
    { pet_type: 'ferret', facts: 'High-protein, low-carb commercial ferret food, frequent small meals' },
    { pet_type: 'turtle', facts: 'Species-specific commercial turtle food, aquatic plants, vegetables' },
    { pet_type: 'bearded dragon', facts: 'Insects, leafy greens, squash, calcium and vitamin D3 supplements' },
    { pet_type: 'reptile', facts: 'Species-specific diet: insects, vegetables, or whole prey depending on type' },
    { pet_type: 'chinchilla', facts: 'High-fiber pellets, timothy hay, limited treats, no fresh fruits' },
    { pet_type: 'hedgehog', facts: 'High-protein, low-fat commercial hedgehog or cat food' },
    { pet_type: 'parrot', facts: 'High-quality pellets, fresh fruits, vegetables, nuts in moderation' },
    { pet_type: 'fish', facts: 'Species-appropriate flakes, pellets, or live/frozen foods' },
    { pet_type: 'iguana', facts: 'Leafy greens, vegetables, limited fruits, calcium supplements' },
    { pet_type: 'gecko', facts: 'Insects (crickets, mealworms), commercial gecko diet, calcium dusting' }
  ])
    .then(() => logger.info('collection populated'))
    .catch(err => logger.error('error populating collection:', err));
};