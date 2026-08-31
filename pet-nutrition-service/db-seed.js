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
    { pet_type: 'fish', facts: 'Species-specific fish flakes or pellets, avoid overfeeding' },
    { pet_type: 'horse', facts: 'High-fiber hay, quality grains, and fresh vegetables' },
    { pet_type: 'rabbit', facts: 'Unlimited timothy hay, fresh leafy greens, and limited pellets' },
    { pet_type: 'ferret', facts: 'High-protein, low-carbohydrate meat-based diet' },
    { pet_type: 'guinea pig', facts: 'Unlimited hay, vitamin C-rich vegetables, and pellets' },
    { pet_type: 'reptile', facts: 'Species-specific diet with proper calcium and vitamin supplementation' },
    { pet_type: 'amphibian', facts: 'Live or frozen insects and specialized amphibian pellets' },
    { pet_type: 'chinchilla', facts: 'Timothy hay-based diet with minimal pellets and no treats' },
    { pet_type: 'hedgehog', facts: 'High-quality cat food, insects, and occasional fruits' },
    { pet_type: 'turtle', facts: 'Commercial turtle pellets, leafy greens, and protein sources' },
    { pet_type: 'parrot', facts: 'Varied diet of pellets, fresh fruits, vegetables, and nuts' },
    { pet_type: 'goat', facts: 'Quality hay, browse, limited grain, and mineral supplements' }
  ])
    .then(() => logger.info('collection populated'))
    .catch(err => logger.error('error populating collection:', err));
};
